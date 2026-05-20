export const WORDS = [
  'cat', 'dog', 'house', 'tree', 'sun', 'moon', 'car', 'boat', 'fish', 'bird',
  'apple', 'pizza', 'cake', 'book', 'phone', 'chair', 'table', 'door', 'key', 'hat',
  'shoe', 'ball', 'star', 'cloud', 'rain', 'snow', 'fire', 'water', 'mountain', 'river',
  'guitar', 'piano', 'camera', 'clock', 'flower', 'garden', 'beach', 'island', 'rocket', 'robot',
  'dragon', 'castle', 'wizard', 'pirate', 'treasure', 'rainbow', 'butterfly', 'elephant', 'giraffe', 'penguin',
];

export const pickWord = (used = new Set()) => {
  const available = WORDS.filter((w) => !used.has(w));
  const pool = available.length > 0 ? available : WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
};
