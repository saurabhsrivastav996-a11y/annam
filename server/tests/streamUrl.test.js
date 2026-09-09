import { parseStreamUrl, isPlayableStreamUrl } from '../src/utils/streamUrl.js';

const ID = 'dQw4w9WgXcQ'; // any well-formed 11-character YouTube id

describe('YouTube links', () => {
  it.each([
    ['watch', `https://www.youtube.com/watch?v=${ID}`],
    ['watch with extra params', `https://www.youtube.com/watch?app=desktop&v=${ID}&t=30s`],
    ['short link', `https://youtu.be/${ID}`],
    ['short link with params', `https://youtu.be/${ID}?t=12`],
    ['live', `https://www.youtube.com/live/${ID}`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['mobile', `https://m.youtube.com/watch?v=${ID}`],
    ['no-cookie', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['bare domain', `https://youtube.com/watch?v=${ID}`],
  ])('handles a %s link', (_label, url) => {
    const result = parseStreamUrl(url);

    expect(result).not.toBeNull();
    expect(result.kind).toBe('youtube');
    expect(result.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&modestbranding=1`);
    expect(result.watchUrl).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('trims surrounding whitespace from a pasted link', () => {
    expect(parseStreamUrl(`  https://youtu.be/${ID}  `)?.kind).toBe('youtube');
  });

  it('rejects a channel link with no video id', () => {
    expect(parseStreamUrl('https://www.youtube.com/@somekitchen/live')).toBeNull();
    expect(parseStreamUrl('https://www.youtube.com/watch?v=tooshort')).toBeNull();
  });
});

describe('direct camera URLs', () => {
  it.each(['https://cam.example.com/kitchen.mp4', 'https://cam.example.com/live/stream.m3u8', 'https://cam.example.com/feed.webm'])(
    'accepts %s',
    (url) => {
      expect(parseStreamUrl(url)).toEqual({ kind: 'file', embedUrl: url, watchUrl: url });
    }
  );

  it('accepts a media URL carrying a query string', () => {
    const url = 'https://cam.example.com/kitchen.m3u8?token=abc';
    expect(parseStreamUrl(url)?.kind).toBe('file');
  });
});

describe('rejected input', () => {
  it.each([
    ['empty string', ''],
    ['null', null],
    ['not a URL', 'just some text'],
    ['a non-media page', 'https://example.com/watch'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['a file: URL', 'file:///etc/passwd'],
  ])('returns null for %s', (_label, url) => {
    expect(parseStreamUrl(url)).toBeNull();
  });
});

describe('isPlayableStreamUrl', () => {
  it('treats an empty value as fine — transparency without a stream is allowed', () => {
    expect(isPlayableStreamUrl('')).toBe(true);
    expect(isPlayableStreamUrl(undefined)).toBe(true);
  });

  it('accepts a YouTube link and rejects junk', () => {
    expect(isPlayableStreamUrl(`https://youtu.be/${ID}`)).toBe(true);
    expect(isPlayableStreamUrl('https://example.com/not-a-stream')).toBe(false);
  });
});
