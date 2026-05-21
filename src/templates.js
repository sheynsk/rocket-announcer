const quotes = [
  'The only way to do great work is to love what you do. — Steve Jobs',
  'Innovation distinguishes between a leader and a follower. — Steve Jobs',
  'Stay hungry, stay foolish. — Steve Jobs',
  'The best time to plant a tree was 20 years ago. The second best time is now.',
  'Do what you can, with what you have, where you are. — Theodore Roosevelt',
  'Success is not final, failure is not fatal: it is the courage to continue that counts. — Churchill',
];

export function processTemplate(text) {
  const now = new Date();
  return text
    .replace(/\{\{date\}\}/gi, now.toLocaleDateString('ru-RU'))
    .replace(/\{\{time\}\}/gi, now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{\{datetime\}\}/gi, now.toLocaleString('ru-RU'))
    .replace(/\{\{day\}\}/gi, now.toLocaleDateString('ru-RU', { weekday: 'long' }))
    .replace(/\{\{randomQuote\}\}/gi, quotes[Math.floor(Math.random() * quotes.length)]);
}
