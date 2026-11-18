import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRaceVideoFilename,
  computeExportDimensions,
  computeShortClipStartSec,
  formatLevelSlugForFilename,
  sanitizeFilenamePart,
} from './videoRecording';

describe('Video Recording & Export Helpers (Feature 14)', () => {
  it('computes exact 16:9 export dimensions for 720p and 1080p', () => {
    assert.deepEqual(computeExportDimensions('1080p'), { width: 1920, height: 1080 });
    assert.deepEqual(computeExportDimensions('720p'), { width: 1280, height: 720 });
  });

  it('builds exact required full race and short clip MP4/WebM filenames', () => {
    assert.equal(
      buildRaceVideoFilename('12', 'Pakistan', false, 'mp4'),
      'FlagRace_Level_12_Pakistan_FullRace.mp4'
    );
    assert.equal(
      buildRaceVideoFilename('5', 'United States', true, 'mp4'),
      'FlagRace_Level_5_United_States_Short30s.mp4'
    );
    assert.equal(
      buildRaceVideoFilename('1', 'Brazil', false, 'webm'),
      'FlagRace_Level_1_Brazil_FullRace.webm'
    );
  });

  it('sanitizes unsafe filename characters safely', () => {
    assert.equal(sanitizeFilenamePart('  !@#Brazil$$  '), 'Brazil');
    assert.equal(sanitizeFilenamePart('***'), 'Champion');
    assert.equal(formatLevelSlugForFilename(42), '42');
    assert.equal(formatLevelSlugForFilename(undefined, 'Hard', 'Quick'), 'Quick');
  });

  it('computes start offset for last 30 seconds short clip accurately', () => {
    assert.equal(computeShortClipStartSec(18.5), 0);
    assert.equal(computeShortClipStartSec(30), 0);
    assert.equal(computeShortClipStartSec(46.25), 16.25);
  });
});
