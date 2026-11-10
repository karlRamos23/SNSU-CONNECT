// Run once: npm run vapid  -> copy the two keys into your .env file
const webpush = require('web-push');
const k = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + k.publicKey);
console.log('VAPID_PRIVATE_KEY=' + k.privateKey);
console.log('VAPID_SUBJECT=mailto:you@example.com');
