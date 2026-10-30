# Fake It Till You Make It

A real-time, browser-based multiplayer bluffing party game for 2–8 players.

## Run it on your computer

1. Install Node.js 18 or newer: https://nodejs.org/
2. Extract this ZIP folder.
3. Open a terminal in the extracted folder.
4. Run `npm install`
5. Run `npm start`
6. Open http://localhost:3000 in your browser.

To test multiplayer locally, open the page in two different browser windows and create/join the same room.

## Deploy it online

This project needs a Node.js host because players connect through Socket.IO. You can deploy the folder to a Node.js hosting service that supports WebSockets (for example, Render).

- Build command: `npm install`
- Start command: `npm start`
- The server reads the hosting provider's `PORT` environment variable automatically.

After deployment, use the public HTTPS URL as the project link on your submission page.

## How to play

- One player creates a room and shares its 5-character code.
- 2–8 players join. The host starts a 3–10 round game.
- Each round, one storyteller writes a statement and privately marks it true or bluff.
- Other players vote whether they believe it.
- The storyteller earns points for fooling the group; voters earn a point for identifying the truth.
- The leaderboard updates after each round.

## Important notes

- This is an MVP prototype. Room state is held in server memory, so rooms reset if the server restarts.
- Keep the deployed server running while playing.
- This project does not include accounts, persistent rankings, moderation, or a database.
