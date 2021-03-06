/**
 * Routes for /users/*
 *
 * Handles user login and register.
 *
 * routes:
 *
 * GET /login: Display login form
 *
 * POST /login: Authenticate user password
 *
 * GET /register: Display register form
 *
 * POST /register: Register user password
 *
 */

import express = require("express");

import * as usersDB from "../model/users";
import { asyncMiddleware } from "../utils/asyncMiddleware";
import * as crypt from "../utils/crypt";
import { ERRORS, JSONResponse } from "../utils/JSONResponse";

export const router = express.Router();

let userData: usersDB.UserData;

/**
 * Check if user has registered a password in the app yet.
 * @returns
 */
function isRegistered(): boolean {
  return userData.password !== undefined;
}

/**
 * Express middleware to check whether the user is already logged in.
 * If yes, then redirect to root.
 * @name checkUserLoggedIn
 * @function
 */
router.use((req, res, next) => {
  // If user is logged in, ONLY allow logout request
  if (req.session.user || !req.session.locked) {
    res.redirect("/");
  } else {
    next();
  }
});

/**
 * Express middleware to read userData file and get its contents.
 * @name readUserData
 * @function
 */
router.use(asyncMiddleware(async (_1, _2, next) => {
  userData = await usersDB.getUserData();
  next();
}));

/**
 * Route to serve login form
 * @name get/users/login
 * @function
 */
router.get("/login", (_1, res) => {
  res.render("login.html");
});

router.post("/login", asyncMiddleware(async (req, res) => {
  if (!isRegistered()) {
    return JSONResponse.Error(res, ERRORS.UserErrors.NotRegistered);
  }
  const password: string = req.body.password;

  // Check if password field is provided
  if (password === undefined) {
    return JSONResponse.Error(res, ERRORS.UserErrors.LoginIncorrect);
  }

  // Verify password
  if (await crypt.verifyPassword(password, userData.password)) {
    // If password valid then set user session
    req.session.user = "user";
    req.session.locked = false;
    return JSONResponse.Data(res, {
      type: "session",
      id: req.session.id
    });
  } else {
    return JSONResponse.Error(res, ERRORS.UserErrors.LoginIncorrect);
  }
}));
