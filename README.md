TODO: Naming. Replace "this library" with the name eventually

# PinkyDex

A promise-based wrapper for IndexedDB that is as simple as
possible. Pinky Promise.

# Goals / Features

- Promise based
- Otherwise closely follows IndexedDB's api. No magic abstractions
- Easy to escape to raw IndexedDB if you need to
- Nice API with functional query syntax and chainable methods

# Examples

Make simple queries extremely simply

```javascript
await db.store("pets").cursor().collect();
```

Make somewhat more complicated queries easy to write.

```javascript
await db.store("phonebook")
  .cursor()
  .where(({value}) => (/[jJ]oh?n/).test(value.fname))
  .transform(({value}) => `${value.fname} ${value.lname[0]}. ${value.phonenum}`)
  .collect()
// ["John S. 555-1234", "Jon P. 555-9876"]
```


Define a schema:

```javascript
import Nextie from 'nextie';

const db = Nextie('my-database', {
    versions: {
        1: (handle) => {
        },
        2: (handle) => {
        }
    }
})
```

# Design / Architecture

IndexedDB is an extremly useful feature of browsers, allowing storage
and retrieval of structured data client side. However it's API feels
very outdated and a bit too low level.

Some libraries have tried to solve this problem by more or less
abstracting over IndexedDB, treating it as a storage layer, and
providing a distinct separate query language. Examples of this
approach include Dexie.js and RxDB. While this approach has its
merits, it suffers from a lot of the same issues that ORMs suffer
from, namely they end up being leaky abstractions, and become very
painful to use when you get off the happy path.

PinkyDex takes a different approach. It stays as close to the base
IndexedDB design as possible while still simplifying common use cases
by providing a standardized promise-based API. Because we stay close
to the original API, it's helpful to understand IndexedDB to

The following objects are just thin wrappers over the underlying
indexeddb objects:

- Database (IDBDatabase) :: a database handle
- Store (IDBObjectStore) :: an objectStore
- Index (IDBIndex) :: an index
- Cursor (IDBCursor) :: A cursor

For each of these objects (except cursor), if you need to break out of
the thin wrapper, you can get the indexeddb version of them by calling
the `.toNative()` async method. E.g.  `let idbNativeStore = await
myStore.toNative()`


# Tasks

## Create / Update a database

`new Database(dbName, migrations, versionChangeHandler)`

## From a database

| Get a store | |

## In a store

| Add a record | store.add(value, key) |
| Put a record | store.put(value, key) |
| Clear all records
Get a cursor
Get an index

## In an index

Get a cursor

## With a cursor

| delete a record | |
| update a record | |

## Using a cursor

Filter based on keys / values before collection
Transform keys / values before collection
Collect all keys / values

# Breaking out to the IndexedDB API

This library intentionally does not provide a wrapper/interface for
100% of the functionality of IndexedDB. From any object in this
library it is easy to access the underlying IndexedDB object.

- await db.toNative()
- await store.toNative()
- await store.transaction()
- await index.toNative()
- await index.
- await cursor.toNative()
- await cursor.source()

# Filtering

Three places that filtering can happen

1. IDBIndex
2. Cursor filtering functions
3. After collection, in javascript

They each have their benefits and drawbacks.

**IDBIndex:**

- Performant, sub-linear
- Very Limitted filtering functionality.
- Compound indexes are available but difficult to use.

**Cursor `.where` method**

- Doesn't use any indexing, so has worse run-time characteristics
  (linear run-time)
- But better memory impact than just doing filtering after collection
  since (don't have to build the full array)
- Combines well with the mapping, grouping, and reducing functionality
  in this library

**In Javascript**

- Full control over behaviour using all of javascript's tools
- Requires passing around a full copy of the results

Summarized:

| Method               | Filtering performed | Complexity (n rows, k selected) |
|----------------------|---------------------|---------------------------------|
| Index(<IDBKeyRange>) | in IndexedDB        | time: < O(n); space: O(k)       |
| `.where`             | in this library [1] | time: O(n); space O(k)          |
| `filter`             | in your application | time: O(n); space O(n)          |

[1] More specifically this library handles it during `cursor` iteration.

# Transactions

Transactions in IndexedDB are a bit unusual

In this library, a transaction is opened when you call
`db.store(<store-name>)`. You can get the underlying transaction from
the store using the `.transaction` method of the store instance.

IndexedDB transactions automatically commit when there are no
outstanding requests for some period of time. For this reason, don't
hold long lived references to `Store` objects from this
library. Instead, treat a `Store` object like a transaction. Do any
heavy data / network processing first, then create a short-lived
`Store` object to add your records to the database.

For multi-store transactions, there [will be / is] a `Transaction`
object.

# Naming

simple

plain
  - vanilla

wrapper
  - burrito
  - dumpling
  - onion

indexed
  - dex
  - ind

database
  - db
  - base

promise
  - oath
  - vow
  - pledge
  - bond

dumpling-oath
vexie

Pinky Promise

PinkyDex

# TODO

- alternate constructor for when you're inside a DB migration function
  (e.g. already have a db object to use)
- Multi-store transactions
- Index method for `get`
- Test that during transactions, appropriately handle errors mid-way
  through.
  - E.g. doing a bunch of adds and one fails, should roll back all
    adds that happened in that transaction
- Test deep keypaths (e.g.) "contact.name.firstname" (first find where
  they matter)
- Evaluate returning the error object directly when rejects happen
  (rather than a string). See if you can catch / switch on the
  different error types.
- Locale implementation / testing

- Add support for joins

## Multi store transactions

If you want to open a transaction that touches multiple stores, or
is in readonly mode.

```
const myTransaction = db.transaction(["store1", "store2"]);
const store1 = myTransaction.store("store1");
const store2 = myTransaction.store("store2");
```

## Joins


Experimental / not yet implemented

```javascript
db
  .transaction(["store1", "store2"])
  .store("store1")
  .cursor()
  .join("store2", store1KeyFn, store2KeyFn)
  .collect()

[
  [joinKey, [store1Objs, store2Objs]]
]

```

Indexeddb in not a relational database, and does not natively support
joins.
