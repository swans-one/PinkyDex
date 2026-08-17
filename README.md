TODO: Naming. Replace "this library" with the name eventually

# Nextie

A simple wrapper for indexeddb.

Simpler than dexie

Assumes you know how indexeddb works. Helps you keep track of the
bookkeeping.

# Features

- Promise based
- Easy to break out to plain indexeddb
- No magic abstractions
- Convenient querying
- Easy to sync to a backend (maybe?)

# Examples

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

The following objects are just thin wrappers over the underlying
indexeddb objects:

- Handle (IdbDatabase) :: a database handle
- Store (IdbObjectStore) :: an objectStore
- Index (IdbIndex) :: an index
- Range (IdbKeyRange) :: a key range

For each of these objects, if you need to break out of the thin
wrapper, you can get the indexeddb version of them by calling the
`.toNative()` async method. E.g.
`let idbNativeStore = await store.toNative()`


```
db.store("contacts")
  .index("firstName")
  .inRange(Range({start: "A", end: "G"}))
  .selectKeys(["firstName", "lastName", "phone"])
  .transform(row => )
  .dropIf()
  .collect()
```

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

# Naming

simple
  -

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

# TODO

- During transactions, appropriately handle errors mid-way through.
  - E.g. doing a bunch of adds and one fails, should roll back all
    adds that happened in that transaction
