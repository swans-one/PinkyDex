# Nextie

A simple wrapper for indexeddb.

Simpler than dexie

# Features

- Promise based

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
