import { createServer, type Server, type ServerResponse } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { ROOM_NAME } from '@anime/shared';
import { storage } from './persistence/index.js';
import { logger } from './util/logger.js';

const SCOPE = 'http';

/**
 * A plain HTTP server for Colyseus to attach to.
 *
 * Owning it rather than letting Colyseus make its own means the same port
 * answers both the WebSocket upgrade and a `/health` probe - which is what a
 * managed host polls to decide the service is up.
 */
export const createHttpServer = (): Server =>
  createServer((request, response) => {
    if (request.url === '/health') {
      void handleHealth(response);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
  });

/**
 * The health probe, and the ONE place a room count is observable from outside.
 *
 * A managed host polls this to decide the service is up, so the useful thing
 * to report beside "ok" is what the process is actually holding: how many
 * rooms are live and how many players are in them. That makes two facts about
 * this game checkable from outside the process rather than only by reading its
 * logs - that a room holds at most fifteen, and that an empty room CLOSES
 * ITSELF rather than lingering with a simulation loop nobody is in.
 *
 * `verify:capacity` asserts exactly that against a running server.
 *
 * It ANSWERS EVEN WHEN THE DATABASE IS DOWN. Legion restarts a pod whose
 * probe fails, and a restart does not bring a database back; what it does is
 * drop every player who was mid-run. The outage is reported in the body and
 * in the log, and joins fail cleanly in the room instead.
 */
const handleHealth = async (response: ServerResponse): Promise<void> => {
  let rooms = 0;
  let players = 0;
  try {
    const live = await matchMaker.query({ name: ROOM_NAME });
    rooms = live.length;
    for (const room of live) players += room.clients;
  } catch (error) {
    // A health endpoint that can fail is not a health endpoint. An unavailable
    // matchmaker is reported as zero rooms rather than as a 500.
    logger.warn(SCOPE, `could not count rooms: ${String(error)}`);
  }

  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ ok: true, room: ROOM_NAME, rooms, players, storage: storage.kind }));
};
