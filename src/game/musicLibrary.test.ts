import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRACK_ID,
  getTrackById,
  getTracksByCategory,
  MUSIC_CATEGORIES,
  MUSIC_TRACKS,
  pickRandomTrendingTrack,
} from './musicLibrary';

describe('Trending Music Library (Feature 15)', () => {
  it('contains exactly 5 categories with 4 unique tracks each (20 total)', () => {
    assert.equal(MUSIC_CATEGORIES.length, 5);
    assert.equal(MUSIC_TRACKS.length, 20);

    const uniqueIds = new Set(MUSIC_TRACKS.map((t) => t.id));
    assert.equal(uniqueIds.size, 20);

    MUSIC_CATEGORIES.forEach((cat) => {
      const catTracks = getTracksByCategory(cat.id);
      assert.equal(
        catTracks.length,
        4,
        `Category ${cat.title} should have 4 tracks, got ${catTracks.length}`
      );
      catTracks.forEach((t) => {
        assert.ok(t.bpm >= 100 && t.bpm <= 160);
        assert.ok(t.bassNotes.length >= 8);
        assert.ok(t.leadNotes.length >= 8);
      });
    });
  });

  it('resolves tracks by ID and returns null for "none"', () => {
    const def = getTrackById(DEFAULT_TRACK_ID);
    assert.ok(def);
    assert.equal(def.title, 'Viral Beat Drop');
    assert.equal(getTrackById('none'), null);
  });

  it('picks a random trending track and avoids repeating excluded ID when possible', () => {
    for (let i = 0; i < 15; i++) {
      const picked = pickRandomTrendingTrack(DEFAULT_TRACK_ID);
      assert.ok(picked.id);
      assert.notEqual(picked.id, DEFAULT_TRACK_ID);
    }
  });
});
