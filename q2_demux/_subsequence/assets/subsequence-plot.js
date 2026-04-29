(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var WIDTH = 960;
  var HEIGHT = 420;
  var MARGIN = { top: 24, right: 72, bottom: 56, left: 64 };
  var INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
  var INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    return el;
  }

  function textEl(text, attrs) {
    var el = svgEl('text', attrs);
    el.textContent = text;
    return el;
  }

  function formatPercent(value) {
    return (value * 100).toFixed(2) + '%';
  }

  function makeScale(domainMin, domainMax, rangeMin, rangeMax) {
    var span = domainMax - domainMin || 1;
    return function (value) {
      return rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
    };
  }

  function invertScale(domainMin, domainMax, rangeMin, rangeMax, value) {
    var span = rangeMax - rangeMin || 1;
    return domainMin + ((value - rangeMin) / span) * (domainMax - domainMin);
  }

  function countByPosition(directionData) {
    var counts = {};
    directionData.counts.forEach(function (item) {
      counts[item.position] = item.count;
    });
    return counts;
  }

  function maxVisibleCount(counts, start, end) {
    var maxCount = 0;
    for (var position = start; position <= end; position += 1) {
      maxCount = Math.max(maxCount, counts[position] || 0);
    }
    return maxCount;
  }

  function niceTicks(min, max, count) {
    if (max <= min) {
      return [min];
    }

    var step = Math.max(1, Math.ceil((max - min) / count));
    var ticks = [];
    var first = Math.ceil(min / step) * step;

    for (var value = first; value <= max; value += step) {
      ticks.push(value);
    }

    if (ticks[0] !== min) {
      ticks.unshift(min);
    }
    if (ticks[ticks.length - 1] !== max) {
      ticks.push(max);
    }

    return ticks;
  }

  function drawAxes(svg, start, end, maxCount, totalReads, xScale, yScale) {
    var x0 = MARGIN.left;
    var x1 = MARGIN.left + INNER_WIDTH;
    var y0 = MARGIN.top + INNER_HEIGHT;

    svg.appendChild(svgEl('line', {
      class: 'axis',
      x1: x0,
      x2: x1,
      y1: y0,
      y2: y0
    }));
    svg.appendChild(svgEl('line', {
      class: 'axis',
      x1: x0,
      x2: x0,
      y1: MARGIN.top,
      y2: y0
    }));
    svg.appendChild(svgEl('line', {
      class: 'axis proportion-axis',
      x1: x1,
      x2: x1,
      y1: MARGIN.top,
      y2: y0
    }));

    niceTicks(start, end, 10).forEach(function (tick) {
      var x = xScale(tick);
      svg.appendChild(svgEl('line', {
        class: 'tick',
        x1: x,
        x2: x,
        y1: y0,
        y2: y0 + 5
      }));
      svg.appendChild(textEl(tick, {
        class: 'tick-label',
        x: x,
        y: y0 + 20,
        'text-anchor': 'middle'
      }));
    });

    niceTicks(0, maxCount, 6).forEach(function (tick) {
      var y = yScale(tick);
      svg.appendChild(svgEl('line', {
        class: 'tick',
        x1: x0 - 5,
        x2: x0,
        y1: y,
        y2: y
      }));
      svg.appendChild(textEl(tick, {
        class: 'tick-label',
        x: x0 - 10,
        y: y + 4,
        'text-anchor': 'end'
      }));
    });

    niceTicks(0, maxCount, 6).forEach(function (tick) {
      var y = yScale(tick);
      var proportion = totalReads > 0 ? tick / totalReads : 0;
      svg.appendChild(svgEl('line', {
        class: 'tick proportion-axis',
        x1: x1,
        x2: x1 + 5,
        y1: y,
        y2: y
      }));
      svg.appendChild(textEl(formatPercent(proportion), {
        class: 'tick-label proportion-label',
        x: x1 + 10,
        y: y + 4,
        'text-anchor': 'start'
      }));
    });

    svg.appendChild(textEl('Base position', {
      class: 'axis-label',
      x: MARGIN.left + INNER_WIDTH / 2,
      y: HEIGHT - 12,
      'text-anchor': 'middle'
    }));
    svg.appendChild(textEl('Occurrence count', {
      class: 'axis-label',
      transform: 'translate(10 ' + (MARGIN.top + INNER_HEIGHT / 2) +
        ') rotate(-90)',
      'text-anchor': 'middle'
    }));
    svg.appendChild(textEl('Proportion of reads', {
      class: 'axis-label proportion-label',
      transform: 'translate(' + (WIDTH - 16) + ' ' +
        (MARGIN.top + INNER_HEIGHT / 2) + ') rotate(90)',
      'text-anchor': 'middle'
    }));
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function showTooltip(event, kmer, directionData, position, count) {
    var tooltip = document.getElementById('tooltip');
    var proportion = 0;
    if (directionData.totalReads > 0) {
      proportion = count / directionData.totalReads;
    }
    tooltip.innerHTML = [
      '<strong>' + kmer + '</strong>',
      '<strong>Position ' + position + '</strong>',
      'Count: ' + count,
      'Proportion: ' + formatPercent(proportion)
    ].join('<br>');
    tooltip.hidden = false;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    var tooltip = document.getElementById('tooltip');
    tooltip.style.left = (event.clientX + 12) + 'px';
    tooltip.style.top = (event.clientY + 12) + 'px';
  }

  function hideTooltip() {
    document.getElementById('tooltip').hidden = true;
  }

  function renderPlot(panel, directionData, state) {
    var svg = panel.querySelector('svg');
    var counts = countByPosition(directionData);
    var start = state.start;
    var end = state.end;
    var visiblePositions = Math.max(1, end - start + 1);
    var maxCount = Math.max(1, maxVisibleCount(counts, start, end));
    var xScale = makeScale(start - 0.65, end + 0.65, MARGIN.left,
      MARGIN.left + INNER_WIDTH);
    var yScale = makeScale(0, maxCount, MARGIN.top + INNER_HEIGHT,
      MARGIN.top);
    var barWidth = Math.max(1, INNER_WIDTH / visiblePositions - 1);

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    drawAxes(svg, start, end, maxCount, directionData.totalReads, xScale,
      yScale);

    for (var position = start; position <= end; position += 1) {
      var count = counts[position] || 0;
      if (count === 0) {
        continue;
      }

      var barHeight = MARGIN.top + INNER_HEIGHT - yScale(count);
      var bar = svgEl('rect', {
        class: 'bar',
        x: xScale(position) - barWidth / 2,
        y: yScale(count),
        width: barWidth,
        height: barHeight,
        tabindex: 0
      });

      (function (pos, value) {
        bar.addEventListener('mousemove', function (event) {
          showTooltip(event, state.sequence, directionData, pos, value);
        });
        bar.addEventListener('mouseleave', hideTooltip);
      }(position, count));

      svg.appendChild(bar);
    }

    addDragZoom(svg, directionData, state, panel);
  }

  function clampDomain(start, end, maxPosition) {
    start = Math.max(1, Math.min(maxPosition, Math.round(start)));
    end = Math.max(1, Math.min(maxPosition, Math.round(end)));

    if (start > end) {
      var tmp = start;
      start = end;
      end = tmp;
    }

    return { start: start, end: end };
  }

  function setInputs(panel, state) {
    panel.querySelector('[data-role="start"]').value = state.start;
    panel.querySelector('[data-role="end"]').value = state.end;
  }

  function updateDomain(panel, directionData, state, start, end) {
    var domain = clampDomain(start, end, directionData.maxPosition);
    state.start = domain.start;
    state.end = domain.end;
    setInputs(panel, state);
    renderPlot(panel, directionData, state);
  }

  function addDragZoom(svg, directionData, state, panel) {
    var dragStart = null;
    var selection = null;

    svg.ondblclick = function () {
      updateDomain(panel, directionData, state, 1, directionData.maxPosition);
    };

    svg.onmousedown = function (event) {
      var point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      var cursor = point.matrixTransform(svg.getScreenCTM().inverse());

      if (cursor.x < MARGIN.left || cursor.x > MARGIN.left + INNER_WIDTH ||
          cursor.y < MARGIN.top || cursor.y > MARGIN.top + INNER_HEIGHT) {
        return;
      }

      dragStart = cursor.x;
      selection = svgEl('rect', {
        class: 'selection',
        x: dragStart,
        y: MARGIN.top,
        width: 0,
        height: INNER_HEIGHT
      });
      svg.appendChild(selection);
    };

    svg.onmousemove = function (event) {
      if (dragStart === null || selection === null) {
        return;
      }

      var point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      var cursor = point.matrixTransform(svg.getScreenCTM().inverse());
      var x = Math.max(MARGIN.left, Math.min(MARGIN.left + INNER_WIDTH,
        cursor.x));

      selection.setAttribute('x', Math.min(dragStart, x));
      selection.setAttribute('width', Math.abs(x - dragStart));
    };

    svg.onmouseup = function (event) {
      if (dragStart === null || selection === null) {
        return;
      }

      var point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      var cursor = point.matrixTransform(svg.getScreenCTM().inverse());
      var x = Math.max(MARGIN.left, Math.min(MARGIN.left + INNER_WIDTH,
        cursor.x));
      var low = Math.min(dragStart, x);
      var high = Math.max(dragStart, x);
      var nextStart = invertScale(state.start - 0.5, state.end + 0.5,
        MARGIN.left, MARGIN.left + INNER_WIDTH, low);
      var nextEnd = invertScale(state.start - 0.5, state.end + 0.5,
        MARGIN.left, MARGIN.left + INNER_WIDTH, high);

      dragStart = null;
      selection.remove();
      selection = null;

      if (Math.abs(high - low) > 8) {
        updateDomain(panel, directionData, state, Math.ceil(nextStart),
          Math.floor(nextEnd));
      }
    };
  }

  function directionTitle(direction) {
    return direction.charAt(0).toUpperCase() + direction.slice(1) + ' reads';
  }

  function createPanel(subsequenceData, directionData) {
    var panel = document.createElement('section');
    var header = document.createElement('div');
    var summary = document.createElement('div');
    var controls = document.createElement('div');
    var plotWrap = document.createElement('div');
    var svg = svgEl('svg', {
      class: 'plot',
      viewBox: '0 0 ' + WIDTH + ' ' + HEIGHT,
      role: 'img',
      'aria-label': directionTitle(directionData.direction) +
        ' ' + subsequenceData.sequence + ' position histogram'
    });
    var state = {
      start: 1,
      end: Math.max(1, directionData.maxPosition),
      sequence: subsequenceData.sequence
    };

    panel.className = 'plot-panel';
    header.className = 'plot-header';
    controls.className = 'plot-controls';
    plotWrap.className = 'plot-wrap';

    summary.innerHTML = [
      '<h2>' + directionTitle(directionData.direction) + '</h2>',
      '<p><code>' + subsequenceData.sequence + '</code>: ' +
        directionData.totalOccurrences + ' occurrence(s) across ' +
        directionData.totalReads + ' read(s); ' +
        directionData.readsWithMatch + ' read(s) contain at least one match.' +
        '</p>'
    ].join('');

    controls.innerHTML = [
      '<label>Start <input data-role="start" type="number" min="1"></label>',
      '<label>End <input data-role="end" type="number" min="1"></label>',
      '<button type="button" data-role="apply">Apply</button>',
      '<button type="button" class="secondary" data-role="reset">Reset</button>'
    ].join('');

    header.appendChild(summary);
    header.appendChild(controls);
    plotWrap.appendChild(svg);
    panel.appendChild(header);
    panel.appendChild(plotWrap);

    if (directionData.maxPosition === 0) {
      var empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No reads were long enough for this k-mer.';
      panel.appendChild(empty);
      controls.style.display = 'none';
      return panel;
    }

    if (directionData.totalOccurrences === 0) {
      var noHits = document.createElement('p');
      noHits.className = 'empty-state';
      noHits.textContent = 'No occurrences were observed in this direction.';
      panel.appendChild(noHits);
    }

    var download = document.createElement('a');
    download.className = 'download';
    download.href = directionData.countsFilename;
    download.textContent = 'Download position counts as TSV';
    panel.appendChild(download);

    controls.querySelector('[data-role="start"]').max =
      directionData.maxPosition;
    controls.querySelector('[data-role="end"]').max =
      directionData.maxPosition;
    setInputs(panel, state);

    controls.querySelector('[data-role="apply"]').addEventListener(
      'click', function () {
        updateDomain(panel, directionData, state,
          controls.querySelector('[data-role="start"]').value,
          controls.querySelector('[data-role="end"]').value);
      });
    controls.querySelector('[data-role="reset"]').addEventListener(
      'click', function () {
        updateDomain(panel, directionData, state, 1,
          directionData.maxPosition);
      });

    renderPlot(panel, directionData, state);
    return panel;
  }

  function renderSubsequence(subsequenceData) {
    var plots = document.getElementById('plots');
    clearNode(plots);

    subsequenceData.directions.forEach(function (directionData) {
      plots.appendChild(createPanel(subsequenceData, directionData));
    });
  }

  function buildKmerSelector(data) {
    var control = document.getElementById('kmer-control');
    var label = document.createElement('label');
    var select = document.createElement('select');

    label.htmlFor = 'kmer-select';
    label.textContent = 'K-mer';
    select.id = 'kmer-select';

    data.subsequences.forEach(function (subsequenceData, index) {
      var option = document.createElement('option');
      option.value = index;
      option.textContent = subsequenceData.sequence;
      select.appendChild(option);
    });

    select.addEventListener('change', function () {
      renderSubsequence(data.subsequences[+select.value]);
    });

    control.appendChild(label);
    control.appendChild(select);
  }

  function init() {
    var data = window.subsequencePositionData;
    var plots = document.getElementById('plots');

    if (!data || !data.subsequences || data.subsequences.length === 0) {
      plots.textContent = 'No plot data were available.';
      return;
    }

    buildKmerSelector(data);
    renderSubsequence(data.subsequences[0]);
  }

  window.addEventListener('DOMContentLoaded', init);
}());
