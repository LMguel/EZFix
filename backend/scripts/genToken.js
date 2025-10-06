const jwt = require('jsonwebtoken');

const id = process.argv[2] || '00000000-0000-0000-0000-000000000001';
const secret = process.env.JWT_SECRET || 'secreto';

const token = jwt.sign({ userId: id }, secret, { expiresIn: '1d' });
console.log(token);
