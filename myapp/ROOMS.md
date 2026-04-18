# Rooms API (Client Integration)

This document describes all currently implemented endpoints under the `/rooms` namespace.

## Base info
- Base URL (example): `http://hack.marrb.net:3000`
- Content type: `application/json`
- Auth for all endpoints here: `Authorization: Bearer <JWT_TOKEN>`
- Get token via `POST /auth/login`

## Common error patterns
- `400` invalid payload / invalid route params
- `401` missing or invalid bearer token
- `403` authenticated but not allowed for this room/action
- `404` room/transaction/item not found
- `500` internal server error

## 1) Create room
- Method: `POST /rooms`
- Body:
```json
{
	"name": "Weekend Trip"
}
```
- Validation:
	- `name` required, trimmed length `3-120`
- Success (`201`):
```json
{
	"message": "Room created successfully.",
	"room": {
		"id": "2",
		"name": "Weekend Trip",
		"ownerUserId": "1",
		"inviteCode": "45eb7121369914e33feead22",
		"createdAt": "2026-04-18T12:10:01.472Z"
	}
}
```
- Notes:
	- Creator is auto-added to room as `owner` member.

## 2) Join room by invite code
- Method: `POST /rooms/join`
- Body:
```json
{
	"inviteCode": "45eb7121369914e33feead22"
}
```
- Success when newly joined (`200`):
```json
{
	"message": "Joined room successfully.",
	"room": {
		"id": "2",
		"name": "Weekend Trip",
		"ownerUserId": "1",
		"inviteCode": "45eb7121369914e33feead22",
		"createdAt": "2026-04-18T12:10:01.472Z"
	},
	"membership": {
		"role": "member",
		"joined_at": "2026-04-18T12:13:43.313Z"
	}
}
```
- Success when already member (`200`):
	- Same room payload, message indicates already joined.

## 3) List rooms joined by current user
- Method: `GET /rooms`
- Body: none
- Success (`200`):
```json
{
	"rooms": [
		{
			"id": "2",
			"name": "Weekend Trip",
			"ownerUserId": "1",
			"inviteCode": "45eb7121369914e33feead22",
			"createdAt": "2026-04-18T12:10:01.472Z",
			"updatedAt": "2026-04-18T12:10:01.472Z",
			"membership": {
				"role": "member",
				"joinedAt": "2026-04-18T12:13:43.313Z"
			}
		}
	]
}
```
- Notes:
	- Returns only rooms where current user is a member.
	- Sorted by latest membership join time first.

## 4) List members of a room
- Method: `GET /rooms/:roomId/members`
- Path params:
	- `roomId` positive integer
- Access:
	- requester must already be a member of that room
- Success (`200`):
```json
{
	"roomId": 2,
	"members": [
		{
			"user": {
				"id": "1",
				"email": "owner@example.com"
			},
			"membership": {
				"role": "owner",
				"joinedAt": "2026-04-18T12:10:01.477Z",
				"invitedByUserId": null
			}
		}
	]
}
```

## 5) Create transaction in room
- Method: `POST /rooms/:roomId/transactions`
- Body:
```json
{
	"companyName": "Acme Payments",
	"ownerUserId": 1,
	"items": [
		{ "itemName": "Beer", "itemCount": 5, "unitPrice": 2 }
	]
}
```
- Access:
	- requester must be room member
	- `ownerUserId` must be room member
- Success (`201`): creates transaction + source items.

## 6) List transactions in room
- Method: `GET /rooms/:roomId/transactions`
- Access:
	- requester must be room member
- Success (`200`) includes transaction items and taken allocations:
```json
{
	"roomId": 2,
	"transactions": [
		{
			"id": "4",
			"roomId": "2",
			"owner": { "userId": "1", "email": "owner@example.com" },
			"companyName": "Beer Shop",
			"totalAmount": 10,
			"createdAt": "2026-04-18T12:56:20.064Z",
			"updatedAt": "2026-04-18T12:56:20.064Z",
			"items": [
				{
					"id": "7",
					"itemName": "Beer",
					"itemCount": 5,
					"unitPrice": 2,
					"lineTotal": 10,
					"taken": {
						"takenCount": 5,
						"remainingCount": 0,
						"takenBy": [
							{
								"userId": "2",
								"email": "guest.user@example.com",
								"quantity": 3,
								"assignedByUserId": "2",
								"updatedAt": "2026-04-18T12:56:25.866Z"
							}
						]
					}
				}
			]
		}
	]
}
```

## 7) Take item quantity for self
- Method: `POST /rooms/:roomId/transactions/:transactionId/items/:itemId/take`
- Body:
```json
{
	"quantity": 3
}
```
- Access:
	- requester must be room member
- Behavior:
	- Adds taken quantity for requester on selected item.
	- Prevents taking more than remaining quantity.

## 8) Assign item quantity to another user (transaction owner only)
- Method: `POST /rooms/:roomId/transactions/:transactionId/items/:itemId/assign`
- Body:
```json
{
	"userId": 2,
	"quantity": 2
}
```
- Access:
	- requester must be transaction owner
	- target `userId` must be room member
- Behavior:
	- Marks part/all remaining quantity as taken by target user.

## 9) Update transaction
- Method: `PATCH /rooms/:roomId/transactions/:transactionId`
- Body (partial, at least one field):
```json
{
	"companyName": "Updated Co",
	"ownerUserId": 1,
	"items": [
		{ "itemName": "Beer", "itemCount": 6, "unitPrice": 2 }
	]
}
```
- Notes:
	- If `items` provided, full transaction item list is replaced.

## 10) Delete transaction
- Method: `DELETE /rooms/:roomId/transactions/:transactionId`
- Body: none
- Success (`200`):
```json
{
	"message": "Transaction deleted successfully.",
	"deletedTransactionId": "3"
}
```

## Client implementation checklist
1. Login user and store JWT token.
2. Add `Authorization: Bearer <token>` on every `/rooms` request.
3. Create/join room first, then load `GET /rooms` + `GET /rooms/:roomId/members`.
4. Use `GET /rooms/:roomId/transactions` as source of truth for transaction and taken state.
5. For split allocation UI, use:
	 - self take: `/take`
	 - owner assign: `/assign`
6. Refresh transaction list after create/update/delete/take/assign actions.

