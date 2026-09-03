# PinkyDex

<img align="right" src="docs/PinkyDexFull.png" alt="An extended pinky finger on an index card" title="PinkyDex">

The simplest modern API for IndexedDB. Pinky Promise.

- Promise based
- Compact, functional query syntax
- Easily manage schema upgrades
- Simplifies IndexedDB's api
- Easy to escape to raw IndexedDB when needed
- Small, handwritten codebase

# Examples

PinkyDex makes queries simpler to read and write. Both for simple and
complex queries.

A simple query: Collect all records from the `"pets"` object store into
an array:

```javascript
await db.store("pets").cursor().collect();
```

A more complicated query: Scan a `"phonebook"` object store for any
record where the first name looks like "John", "john", "Jon" or "jon",
and collect the records into an array of formatted strings:

```javascript
await db.store("phonebook")
  .cursor()
  .where(({value}) => (/[jJ]oh?n/).test(value.fname))
  .transform(({value}) => `${value.fname} ${value.lname[0]}. ${value.phonenum}`)
  .collect()
// ["John S. 555-1234", "Jon P. 555-9876"]
```

In the raw IndexedDB api creating a database or updating the schema
requires a lot of bookkeeping around migrations and `onupgradeneeded`
handlers. PinkyDex handles all of this for you. You just define your
version upgrade functions:

```javascript
const db = new Database('my-database', {
  1: (db) => {
    const pets = db.createObjectStore(
      "pets", { keyPath: id, autoIncrement: true }
    );
    pets.createIndex("name", "name");
  },
  2: (db) => {
    const phonebook = db.createObjectStore(
      "phonebook", { keyPath: id, autoIncrement: true }
    )
    phonebook.createIndex("fname", "fname")
    phonebook.createIndex("lname", "lname")
    phonebook.createIndex("phonenum", "phonenum" { unique: true })
  }
})
```

For a more detailed guide on getting started see the [Quickstart Guide](docs/quicstart-guide.md).

For the full api see [API Reference](docs/api-reference.md).

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


# Breaking out to the IndexedDB API

PinkyDex intentionally does not provide a wrapper/interface for
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
  in PinkyDex

**In Javascript**

- Full control over behaviour using all of javascript's tools
- Requires passing around a full copy of the results

Summarized:

| Method               | Filtering performed | Complexity (n rows, k selected) |
|----------------------|---------------------|---------------------------------|
| Index(<IDBKeyRange>) | in IndexedDB        | time: < O(n); space: O(k)       |
| `.where`             | in PinkyDex [1] | time: O(n); space O(k)          |
| `filter`             | in your application | time: O(n); space O(n)          |

[1] More specifically PinkyDex handles it during `cursor` iteration.

# Transactions

Transactions in IndexedDB are a bit unusual

In PinkyDex, a transaction is opened when you call
`db.store(<store-name>)`. You can get the underlying transaction from
the store using the `.transaction` method of the store instance.

IndexedDB transactions automatically commit when there are no
outstanding requests for some period of time. For this reason, don't
hold long lived references to `Store` objects from this
library. Instead, treat a `Store` object like a transaction. Do any
heavy data / network processing first, then create a short-lived
`Store` object to add your records to the database.

PinkyDex provides the abililty to create transactions explicitly. The
`Transaction` class can be instantiated from a `Databse` instance
using the `.transaction` method. For example:

```
const txn = db.transaction(["store1", "store2"], "readwrite");
const store1 = txn.store("store1");
const store2 = txn.store("store2");
```

Explicit transactions allow:

- Transactions that cross multiple stores
- The ability to explicitly abort with `Transaction.abort`
- The ability to explicitly commit with `Transaction.commit`
- The ability to specify "readonly" vs "readwrite" modes


# Why no generator on cursors?

Something like:

```javascript
const phones = db.store('phoneNumbers');
for await (const cursor of phones.cursor().iter()) {
    console.log(cursor.value.number)
}
```

Two main reasons:

1. Transaction auto commit makes an iterator over a cursor a potential
   footgun.
2. PinkyDex provides alternatives that are easier to use and more
   difficult to abuse.

## Transaction Auto commit

The potential footgun comes from the fact that IndexedDB transactions
auto commit. So the example above could work, but if you do any async
processing in the loop, your cursor can suddenly stop iterating
without getting through the whole set of values:

```javascript
const phones = db.store('phoneNumbers');
for await (const cursor of phones.cursor().iter()) {
    await validateNumber(cursor.value.number); # transaction can autocommit here
    console.log(cursor.value.number)
}
```
## PinkyDex alternatives

```
const phones = db
 .store('phoneNumbers');
 .cursor()
 .transform(
   ({value}) => Promise.try(validateNumber, value.number)
 )
 .collect()
```

# TODO

- Test whether cursor values can be mutated
  - e.g. use transform to add a derived field
  - If not, add a makeCopy function
- Locale implementation / testing (for indexes)
- Break out different docs into docs folders
  - Quickstart
  - API reference
  - Cursors & Queries
  - Transactions
  - Native Objects & responsePromise
- Add primarykey to cursor output
- Add support for joins

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

# License

This project is provided under the MIT license. See
[LICENSE.txt](./LICENSE.txt) for more details.
