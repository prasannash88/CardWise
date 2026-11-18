import { hashText, htmlToText, lineDiff } from '../src/lib/html';

describe('htmlToText', () => {
  it('drops scripts and tags, keeps lines', () => {
    const t = htmlToText('<html><script>var x=1</script><h1>Fees</h1><p>Annual fee &#8377;499 + GST</p><li>Lounge: 2 per quarter</li></html>');
    expect(t).toBe('Fees\nAnnual fee Rs 499 + GST\nLounge: 2 per quarter');
  });
});

describe('change detection', () => {
  it('same text, same hash', () => expect(hashText('abc')).toBe(hashText('abc')));
  it('different text, different hash', () => expect(hashText('abc')).not.toBe(hashText('abd')));
  it('line diff', () => {
    expect(lineDiff('a\nfee 499\nc', 'a\nfee 999\nc')).toEqual({ removed: ['fee 499'], added: ['fee 999'] });
    expect(lineDiff('a\nb', 'b\na')).toEqual({ removed: [], added: [] });
  });
});
