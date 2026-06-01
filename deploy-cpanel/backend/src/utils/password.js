'use strict';

// D-14 / T-01-06 mitigation — the ONLY module that calls bcrypt.
const bcrypt = require('bcrypt');

const ROUNDS = 10;

exports.hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
exports.comparePassword = (plain, hash) => bcrypt.compare(plain, hash);
