// hash-password.js
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the password to hash: ', (password) => {
  if (!password) {
    console.error("Password cannot be empty.");
    rl.close();
    return;
  }
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  console.log('\n--- Hashing Complete ---');
  console.log('Password:', password);
  console.log('Hashed Password (copy this to your .env file):');
  console.log(hash);
  console.log('------------------------');
  rl.close();
});