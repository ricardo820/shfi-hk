# Notifications API (Client Integration)

This document describes room-scoped push notification endpoints.

## Purpose
Notifications are published for room events and delivered only to users who are members of that room.

Implemented event types:
- `transaction_added`
- `debt_pushed`

## Auth
All endpoints require:
- `Authorization: Bearer <JWT_TOKEN>`

## Realtime delivery for Expo (no busy-wait polling)
Use WebSocket from React Native / Expo (`WebSocket` is supported natively).

- URL:
  - `ws://hack.marrb.net:3000/ws/notifications?token=<JWT_TOKEN>`
  - use `wss://...` when your API is behind TLS
- On connect, server sends:
```json
{
  "event": "connected",
  "userId": 1,
  "message": "Realtime notifications connected"
}
```
- On new room notification, server pushes:
```json
{
  "event": "room_notification",
  "notification": {
    "id": "2",
    "roomId": "2",
    "type": "debt_pushed",
    "actorUserId": "2",
    "payload": {
      "fromUserId": 2,
      "toUserId": 1,
      "amount": 14.5,
      "currency": "EUR",
      "note": "I sent the transfer"
    },
    "createdAt": "2026-04-19T..."
  }
}
```
- Optional keepalive from client:
  - send `{"event":"ping"}`
  - server responds with `{"event":"pong","timestamp":"..."}`

## 1) Publish notification: transaction added
- Method: `POST /rooms/:roomId/notifications/transaction-added`
- Body:
```json
{
  "transactionId": 4
}
```

### Rules
- requester must be a room member
- referenced transaction must exist in that room
- notification is delivered to all room members

### Success (`201`)
```json
{
  "message": "Transaction-added notification published.",
  "notification": {
    "id": "1",
    "roomId": "2",
    "type": "transaction_added",
    "actorUserId": "1",
    "payload": {
      "transactionId": 4
    },
    "createdAt": "2026-04-19T..."
  },
  "recipientIds": [1, 2, 3]
}
```

## 2) Publish notification: debt pushed
- Method: `POST /rooms/:roomId/notifications/debt-pushed`
- Body:
```json
{
  "fromUserIds": [2, 3],
  "toUserId": 1,
  "amount": 14.5,
  "currency": "EUR",
  "note": "I sent the transfer"
}
```

### Rules
- requester must be a room member
- all debtor user ids (`fromUserIds`) and `toUserId` must be room members
- only the user who is owed (`toUserId`) can publish this event
- notification is delivered only to debtor users in `fromUserIds`

### Notes
- Backward compatibility: `fromUserId` (single debtor) is still accepted.
- Preferred payload for client app is `fromUserIds`.

### Success (`201`)
```json
{
  "message": "Debt-pushed notification published.",
  "notification": {
    "id": "2",
    "roomId": "2",
    "type": "debt_pushed",
    "actorUserId": "2",
    "payload": {
      "fromUserIds": [2, 3],
      "toUserId": 1,
      "amount": 14.5,
      "currency": "EUR",
      "note": "I sent the transfer"
    },
    "createdAt": "2026-04-19T..."
  },
  "recipientIds": [2, 3]
}
```

## 3) List notifications for current user in room
- Method: `GET /rooms/:roomId/notifications`
- Body: none

### Rules
- requester must be a room member
- returns only notifications delivered to current user

### Success (`200`)
```json
{
  "roomId": 2,
  "notifications": [
    {
      "id": "2",
      "type": "debt_pushed",
      "actor": {
        "userId": "2",
        "email": "guest.user@example.com"
      },
      "payload": {
        "fromUserId": 2,
        "toUserId": 1,
        "amount": 14.5,
        "currency": "EUR",
        "note": "I sent the transfer"
      },
      "isRead": false,
      "deliveredAt": "2026-04-19T...",
      "createdAt": "2026-04-19T..."
    }
  ]
}
```

## Common errors
- `400` invalid payload/params
- `401` missing or invalid bearer token
- `403` requester not allowed for room/action
- `404` room/transaction not found
- `500` internal server error

## Client integration notes
1. After creating transaction, call `POST /rooms/:roomId/notifications/transaction-added`.
2. When owed user confirms debt push, call `POST /rooms/:roomId/notifications/debt-pushed`.
3. Maintain one websocket connection for logged-in user and append incoming `room_notification` events to local store.
4. Use `GET /rooms/:roomId/notifications` only for initial hydration or reconnect recovery.
5. Render by `type` and use `payload` fields to build message text.

## Expo client sketch
```javascript
const socket = new WebSocket(`ws://hack.marrb.net:3000/ws/notifications?token=${token}`);

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.event === "room_notification") {
    // update notification state
  }
};

socket.onopen = () => {
  // optional keepalive
  socket.send(JSON.stringify({ event: "ping" }));
};
```
