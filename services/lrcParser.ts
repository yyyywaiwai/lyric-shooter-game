
import { LyricLine } from '../types';

const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

export function parseLRC(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split('\n');
  const lyrics: LyricLine[] = [];

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10); // Pad to 3 digits for consistency
      const text = match[4].trim();

      const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;

      if (text) {
        lyrics.push({ time: timeInSeconds, text });
      }
    }
  }

  // Sort by time to ensure correct order
  return lyrics.sort((a, b) => a.time - b.time);
}
