import { isAcceptableVote, voteOnReads } from '../vote';

describe('voteOnReads', () => {
  it('returns null with no reads', () => {
    expect(voteOnReads([])).toBeNull();
  });

  it('picks the majority character at each position', () => {
    const v = voteOnReads(['9JRI205', '9JRI205', '9JR1205', '9JRI205']);
    expect(v?.plate).toBe('9JRI205');
    expect(v?.reads).toBe(4);
    expect(v?.confidence).toBeGreaterThan(90);
  });

  it('votes only among reads of the dominant length', () => {
    const v = voteOnReads(['ABC1234', 'ABC1234', 'ABC123']);
    expect(v?.plate).toBe('ABC1234');
    expect(v?.reads).toBe(2);
  });

  it('prefers the digit when a position splits between a digit and its letter twin', () => {
    // Stylized fonts read 2 as Z; the letter can even win the raw count.
    const v = voteOnReads(['ABCZ234', 'ABCZ234', 'ABC2234']);
    expect(v?.plate).toBe('ABC2234');
  });

  it('reports weak positions via minCharPct', () => {
    const v = voteOnReads(['ABC1234', 'ABC1Z34', 'ABC1X34']);
    expect(v?.minCharPct).toBeLessThanOrEqual(34);
  });
});

describe('isAcceptableVote', () => {
  it('requires a minimum number of reads', () => {
    const v = voteOnReads(['ABC1234', 'ABC1234']);
    expect(v && isAcceptableVote(v)).toBe(false);
  });

  it('accepts consistent mixed alphanumeric reads', () => {
    const v = voteOnReads(['9JRI205', '9JRI205', '9JRI205', '9JR1205', '9JRI205']);
    expect(v && isAcceptableVote(v)).toBe(true);
  });

  it('holds all-letter reads to a higher bar', () => {
    // Mixed: overall 94% avg, min ~60% → accepted (avg ≥70, min ≥40).
    const mixed = voteOnReads(['ABC1234', 'ABC1234', 'ABC1234', 'ABC1237', 'ABC1238']);
    expect(mixed && isAcceptableVote(mixed)).toBe(true);
    // All-letter: needs avg ≥80 AND min ≥75. 3/5 agree on last char → 60% min → rejected.
    const letters = voteOnReads(['ABCDEFG', 'ABCDEFG', 'ABCDEFG', 'ABCDEFH', 'ABCDEFI']);
    expect(letters && isAcceptableVote(letters)).toBe(false);
  });

  it('accepts a mixed plate even when one char is genuinely ambiguous (1 vs T/I)', () => {
    // Mirrors real logs: position 0 reads 1,T,T,J,I (44% for winner) but avg is 87%.
    const reads = ['1ABC234', '1ABC234', '1ABC234', '1ABC234', 'TABC234', 'TABC234', 'JABC234', 'IABC234', 'TABC234'];
    const v = voteOnReads(reads);
    expect(v?.plate).toBe('1ABC234');
    expect(v && isAcceptableVote(v)).toBe(true);
  });
});
