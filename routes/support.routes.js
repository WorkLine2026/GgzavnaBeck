const express = require('express');
const { reportProblem } = require('../controllers/support.controller');

const router = express.Router();

// POST /api/support/problem
router.post('/problem', reportProblem);

module.exports = router;