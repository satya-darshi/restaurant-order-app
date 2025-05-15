const bcrypt = require('bcryptjs');

const password = "admin123"; // Change this to the actual password you want to hash
const hashedPassword = bcrypt.hashSync(password, 10);

console.log("Hashed Password:", hashedPassword);
