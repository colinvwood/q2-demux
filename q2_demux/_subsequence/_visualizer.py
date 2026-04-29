# ----------------------------------------------------------------------------
# Copyright (c) 2016-2025, QIIME 2 development team.
#
# Distributed under the terms of the Modified BSD License.
#
# The full license is in the file LICENSE, distributed with this software.
# ----------------------------------------------------------------------------

import collections
import importlib
import json
import os
import shutil

import pandas as pd

from .._util import read_fastq_seqs
from ..types import _PlotQualView
import q2templates


TEMPLATES = importlib.resources.files('q2_demux') / '_subsequence'


def _normalize_subsequence(subsequence):
    subsequence = subsequence.strip().upper()
    if not subsequence:
        raise ValueError('subsequence must contain at least one character.')
    if any(c.isspace() for c in subsequence):
        raise ValueError('subsequence may not contain whitespace.')
    return subsequence


def _normalize_subsequences(subsequences):
    if isinstance(subsequences, str):
        subsequences = [subsequences]

    normalized = []
    seen = set()
    for subsequence in subsequences:
        subsequence = _normalize_subsequence(subsequence)
        if subsequence in seen:
            raise ValueError(
                'subsequence values must be unique. Duplicate value: %s' %
                subsequence)
        normalized.append(subsequence)
        seen.add(subsequence)

    if not normalized:
        raise ValueError('subsequence must contain at least one value.')

    return normalized


def _count_subsequence_positions(sequences, subsequences):
    counts = {
        subsequence: collections.Counter()
        for subsequence in subsequences
    }
    reads_with_match = {
        subsequence: 0
        for subsequence in subsequences
    }
    reads = 0
    max_read_length = 0

    for sequence in sequences:
        sequence = sequence.upper()
        reads += 1
        max_read_length = max(max_read_length, len(sequence))

        for subsequence in subsequences:
            found_in_read = False
            start = sequence.find(subsequence)
            while start != -1:
                counts[subsequence][start + 1] += 1
                found_in_read = True
                start = sequence.find(subsequence, start + 1)

            if found_in_read:
                reads_with_match[subsequence] += 1

    return counts, reads, reads_with_match, max_read_length


def _iter_manifest_fastq_paths(manifest, direction):
    for _, row in manifest.iterrows():
        filename = row[direction]

        if not isinstance(filename, str):
            if filename is None or pd.isna(filename):
                continue

        yield filename


def _iter_fastq_sequences(paths):
    for path in paths:
        for record in read_fastq_seqs(path):
            yield record[1]


def _direction_payload(direction, counts, reads, reads_with_match,
                       max_read_length, subsequence, counts_filename):
    max_start_position = max(0, max_read_length - len(subsequence) + 1)
    total_occurrences = sum(counts.values())

    return {
        'direction': direction,
        'countsFilename': counts_filename,
        'counts': [
            {
                'position': position,
                'count': counts[position],
            }
            for position in sorted(counts)
        ],
        'maxPosition': max_start_position,
        'maxReadLength': max_read_length,
        'readsWithMatch': reads_with_match,
        'totalOccurrences': total_occurrences,
        'totalReads': reads,
    }


def _write_counts_tsv(output_dir, direction_data):
    path = os.path.join(output_dir, direction_data['countsFilename'])

    counts = {
        item['position']: item['count']
        for item in direction_data['counts']
    }

    with open(path, 'w') as fh:
        fh.write('position\tcount\tproportion\n')
        for position in range(1, direction_data['maxPosition'] + 1):
            count = counts.get(position, 0)
            proportion = 0
            if direction_data['totalReads'] > 0:
                proportion = count / direction_data['totalReads']
            fh.write('%d\t%d\t%.6f\n' % (position, count, proportion))


def _compute_subsequence_position_data(data, subsequences):
    data = data.directory_format
    manifest = data.manifest.view(pd.DataFrame)
    directions = list(manifest.columns)

    result = {
        'subsequences': [
            {
                'id': 'kmer-%d' % (index + 1),
                'sequence': subsequence,
                'directions': [],
            }
            for index, subsequence in enumerate(subsequences)
        ],
    }

    for direction in directions:
        paths = _iter_manifest_fastq_paths(manifest, direction)
        sequences = _iter_fastq_sequences(paths)
        counts, reads, reads_with_match, max_read_length = \
            _count_subsequence_positions(sequences, subsequences)

        for subsequence_data in result['subsequences']:
            subsequence = subsequence_data['sequence']
            counts_filename = (
                '%s-%s-subsequence-position-counts.tsv' %
                (subsequence_data['id'], direction))
            subsequence_data['directions'].append(
                _direction_payload(
                    direction, counts[subsequence], reads,
                    reads_with_match[subsequence], max_read_length,
                    subsequence, counts_filename))

    return result


def subsequence_position_plot(output_dir: str, data: _PlotQualView,
                              subsequences: list) -> None:
    subsequences = _normalize_subsequences(subsequences)
    context = {
        'subsequences': ', '.join(subsequences),
    }

    result = _compute_subsequence_position_data(data, subsequences)

    template = os.path.join(TEMPLATES, 'assets', 'index.html')
    q2templates.render(template, output_dir, context=context)

    shutil.copy(os.path.join(TEMPLATES, 'assets', 'subsequence-plot.js'),
                output_dir)
    shutil.copy(os.path.join(TEMPLATES, 'assets', 'style.css'),
                output_dir)

    for subsequence_data in result['subsequences']:
        for direction_data in subsequence_data['directions']:
            _write_counts_tsv(output_dir, direction_data)

    with open(os.path.join(output_dir, 'data.js'), 'w') as fh:
        fh.write('window.subsequencePositionData = ')
        json.dump(result, fh)
        fh.write(';')
