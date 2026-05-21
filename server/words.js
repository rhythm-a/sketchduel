export const WORD_PACKS = {
  basic: {
    label: 'Basic',
    description: 'Everyday objects and simple concepts',
    words: [
      'cat', 'dog', 'house', 'tree', 'sun', 'moon', 'car', 'boat', 'fish', 'bird',
      'apple', 'pizza', 'cake', 'book', 'phone', 'chair', 'table', 'door', 'key', 'hat',
      'shoe', 'ball', 'star', 'cloud', 'rain', 'snow', 'fire', 'water', 'mountain', 'river',
      'guitar', 'piano', 'camera', 'clock', 'flower', 'garden', 'beach', 'island', 'rocket', 'robot',
      'dragon', 'castle', 'wizard', 'pirate', 'treasure', 'rainbow', 'butterfly', 'elephant', 'giraffe', 'penguin',
    ],
  },

  animals: {
    label: 'Animals',
    description: 'Wildlife, pets, and creatures',
    words: [
      'lion', 'tiger', 'bear', 'wolf', 'fox', 'deer', 'rabbit', 'hamster', 'parrot', 'owl',
      'shark', 'whale', 'dolphin', 'octopus', 'crab', 'lobster', 'jellyfish', 'seahorse', 'seal', 'walrus',
      'gorilla', 'chimpanzee', 'koala', 'kangaroo', 'platypus', 'panda', 'zebra', 'rhino', 'hippo', 'camel',
      'peacock', 'flamingo', 'toucan', 'eagle', 'hawk', 'bat', 'hedgehog', 'otter', 'beaver', 'squirrel',
    ],
  },

  food: {
    label: 'Food & Drink',
    description: 'Meals, snacks, and beverages',
    words: [
      'burger', 'hotdog', 'taco', 'sushi', 'ramen', 'pasta', 'lasagna', 'burrito', 'sandwich', 'dumpling',
      'croissant', 'bagel', 'waffle', 'pancake', 'donut', 'muffin', 'brownie', 'cookie', 'cupcake', 'macaron',
      'strawberry', 'watermelon', 'pineapple', 'mango', 'avocado', 'broccoli', 'mushroom', 'carrot', 'potato', 'corn',
      'coffee', 'milkshake', 'lemonade', 'smoothie', 'cocktail', 'teapot', 'ice cream', 'cheese', 'bacon', 'egg',
    ],
  },

  sports: {
    label: 'Sports',
    description: 'Games, sports, and athletics',
    words: [
      'soccer', 'basketball', 'baseball', 'tennis', 'golf', 'volleyball', 'rugby', 'cricket', 'hockey', 'boxing',
      'swimming', 'diving', 'surfing', 'skiing', 'snowboard', 'skateboard', 'cycling', 'marathon', 'hurdles', 'javelin',
      'archery', 'fencing', 'wrestling', 'judo', 'karate', 'gymnastics', 'trampoline', 'weightlifting', 'rowing', 'kayak',
      'badminton', 'squash', 'ping pong', 'frisbee', 'polo', 'lacrosse', 'bowling', 'darts', 'billiards', 'chess',
    ],
  },

  tech: {
    label: 'Technology',
    description: 'Gadgets, software, and internet culture',
    words: [
      'laptop', 'keyboard', 'monitor', 'mouse', 'headphones', 'microphone', 'webcam', 'printer', 'router', 'server',
      'smartphone', 'tablet', 'smartwatch', 'drone', 'satellite', 'telescope', 'microscope', 'calculator', 'joystick', 'gamepad',
      'robot', 'antenna', 'circuit', 'battery', 'solar panel', 'windmill', 'submarine', 'spaceship', 'radar', 'laser',
      'hologram', 'chip', 'cable', 'hard drive', 'cloud', 'bug', 'virus', 'firewall', 'cursor', 'pixel',
    ],
  },

  nature: {
    label: 'Nature',
    description: 'Landscapes, weather, and the natural world',
    words: [
      'volcano', 'glacier', 'waterfall', 'canyon', 'desert', 'jungle', 'swamp', 'meadow', 'cliff', 'cave',
      'tornado', 'hurricane', 'blizzard', 'lightning', 'thunder', 'fog', 'hail', 'aurora', 'eclipse', 'comet',
      'coral reef', 'mangrove', 'tundra', 'savanna', 'oasis', 'lagoon', 'geyser', 'stalactite', 'fossil', 'crystal',
      'acorn', 'cactus', 'fern', 'mushroom', 'seaweed', 'moss', 'bamboo', 'sunflower', 'blossom', 'seed',
    ],
  },

  popculture: {
    label: 'Pop Culture',
    description: 'Movies, music, games, and internet',
    words: [
      'superhero', 'villain', 'sidekick', 'spaceship', 'lightsaber', 'wand', 'potion', 'quest', 'dungeon', 'loot',
      'streaming', 'meme', 'selfie', 'influencer', 'podcast', 'playlist', 'avatar', 'emoji', 'hashtag', 'vlog',
      'concert', 'festival', 'movie theater', 'red carpet', 'trophy', 'award', 'autograph', 'fan art', 'cosplay', 'convention',
      'arcade', 'level up', 'respawn', 'headshot', 'speedrun', 'mod', 'lore', 'boss fight', 'easter egg', 'cutscene',
    ],
  },
};

// Legacy export for backwards compat
export const WORDS = WORD_PACKS.basic.words;

/**
 * Build a combined word pool from selected packs.
 * Always includes 'basic'. Deduplicates across packs.
 */
export const buildWordPool = (packs = ['basic']) => {
  const activePacks = ['basic', ...packs.filter((p) => p !== 'basic')];
  const seen = new Set();
  const pool = [];
  for (const packId of activePacks) {
    const pack = WORD_PACKS[packId];
    if (!pack) continue;
    for (const word of pack.words) {
      if (!seen.has(word)) {
        seen.add(word);
        pool.push(word);
      }
    }
  }
  return pool;
};

export const pickWord = (used = new Set(), wordPool = WORDS) => {
  const available = wordPool.filter((w) => !used.has(w));
  const pool = available.length > 0 ? available : wordPool;
  return pool[Math.floor(Math.random() * pool.length)];
};