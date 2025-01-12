// controllers/authController.js

import User from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

/**
 * Register a new user.
 * Expects JSON body: { "username": "...", "password": "..." }
 */
export const register = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already in use.' });
    }

    // Create new user (password will be hashed by userModel.js "pre-save" hook)
    const newUser = new User({ username, password });
    await newUser.save();

    // Could automatically log them in (create JWT), or just return success
    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Server error during registration.' });
  }
};

/**
 * Log in a user and set JWT in an HTTP-only cookie.
 * Expects JSON body: { "username": "...", "password": "..." }
 */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Find user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Create JWT (with user ID or other payload info)
    // Typically you'd keep the expiry short (e.g., 15m, 1h, etc.)
    const token = jwt.sign(
      { userId: user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );

    // Set JWT as an HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,                    // cannot be accessed by JS in the browser
      secure: process.env.NODE_ENV === 'production', // true in prod only
      sameSite: 'strict',               // helps mitigate CSRF
      maxAge: 60 * 60 * 1000            // 1 hour in milliseconds
    });

    return res.status(200).json({ message: 'Logged in successfully.' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login.' });
  }
};

/**
 * Log out the user by clearing the JWT cookie.
 */
export const logout = (req, res) => {
  // Clear the cookie named 'token'
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  return res.status(200).json({ message: 'Logged out successfully.' });
};
