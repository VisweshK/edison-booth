import express = require("express");
import ip = require("ip");
import multer = require("multer");
import path = require("path");
import shortid = require("shortid");

import { config } from "../../config";
import { Candidate } from "../../shared/models";
import { db, unzipElection } from "../model/elections";

import { asyncMiddleware } from "../utils/asyncMiddleware";
import { ERRORS, JSONResponse } from "../utils/JSONResponse";

export const router = express.Router();

router.use((_REQ, res, next) => {
  res.setHeader("Cache-Control", "no-cache,no-store,max-age=0," +
    "must-revalidate");
  next();
});

function checkIfImported(
  _1: express.Request,
  res: express.Response,
  next: express.NextFunction) {
  if (db.loadDB() === undefined) {
    res.redirect("/");
  } else {
    next();
  }
}

export function lockMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.session.locked) {
    res.redirect("/users/login");
  } else {
    next();
  }
}

const storage = multer.diskStorage({
  destination: config.database.temp,
  filename: (_REQ, file, cb) => {
    cb(null, shortid.generate() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

router.get("/", lockMiddleware, (req, res) => {
  req.session.locked = false;
  const dbPath = db.loadDB();
  res.render("import.html", {
    appName: config.appName,
    currentURL: req.url,
    pageTitle: "Home",
    lanIP: ip.address(),
    alreadyImported: dbPath === undefined ? false : path.basename(dbPath)
  });
});

router.post("/import", upload.single("importedData"),
  asyncMiddleware(async (req, res) => {
    await unzipElection(req.file.path);
    JSONResponse.Data(res, {});
  })
);

router.get("/vote", checkIfImported, asyncMiddleware(async (req, res) => {
  if (!req.session.locked) {
    return res.redirect("/selectPolls");
  }
  const electionData = await db.getElection();
  if (electionData === undefined) {
    return JSONResponse.Error(res, ERRORS.ResourceError.NotFound);
  }

  req.session.locked = true;
  electionData.polls = electionData.polls.filter((poll) => poll.show);
  res.render("vote/vote.html", { election: electionData });
}));

router.post("/vote", checkIfImported, asyncMiddleware(async (req, res) => {
  const voteIDs = req.body.votes as string[];
  const candidates = await Promise.all((voteIDs.map((value) => {
    return (db.getResourceByID(value, "candidate")) as Promise<Candidate>;
  })));

  const pollIDs: string[] = candidates.map((candidate) => candidate.parentID);

  if ((new Set(pollIDs)).size !== pollIDs.length) {
    return JSONResponse.Error(res, ERRORS.ResourceError.VoteError);
  } else {
    await Promise.all(candidates.map((candidate) => {
      return db.incrementVotes(candidate.id);
    }));
    return JSONResponse.Data(res, {});
  }

}));

router.get(
  "/selectPolls",
  checkIfImported,
  lockMiddleware,
  asyncMiddleware(async (req, res) => {
    const election = (await db.getElection());
    if (election === undefined) {
      return JSONResponse.Error(res, ERRORS.ResourceError.NotFound);
    }
    res.render("poll-select.html", {
      appName: config.appName,
      lanIP: ip.address(),
      pageTitle: "Select Polls",
      currentURL: req.url,
      formURL: "/setPolls",
      election: election,
      submitBtnText: "Begin voting",
      submitBtnIcon: "fas fa-angle-double-right"
    });
}));

router.get(
  "/setPolls",
  checkIfImported,
  lockMiddleware,
  asyncMiddleware(async (req, res) => {
    const pollIDs: string[] = req.query.pollIDs;
    const election = await db.getElection();
    await Promise.all(election.polls.map(
      (pollData) => {
        const {candidates, ...poll} = pollData;
        if (pollIDs.indexOf(poll.id) > -1) {
          poll.show = true;
          return db.updateResource(poll.id, poll);
        } else {
          poll.show = false;
          return db.updateResource(poll.id, poll);
        }
      }
    ));
    req.session.locked = true;
    res.redirect("/vote");
  }));
