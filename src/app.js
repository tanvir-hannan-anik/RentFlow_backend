import express from "express";

const app = express();

// This is only a startup placeholder, not a business API.
app.get("/", (request, response) => {
  response.type("text").send("Equipment Rental Platform backend");
});

export default app;
