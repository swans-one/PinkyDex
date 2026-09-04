import { Tester } from './browser-test.js';

import {
  Cursor,
  Database,
  Index,
  Store,
  Transaction,
  responsePromise,
} from '/src/index.js';

const domNode = document.querySelector("#results");
export const test = new Tester(domNode);
const {
  describe: it, expect, expectEqual, expectDeepEqual, expectErr
} = test.methods();

it("Database", async () => {
  responsePromise(
    window.indexedDB.deleteDatabase('test-db-database'));
  const db = new Database("test-db-database", {
    1: (db) => {
      db.createObjectStore('test', { autoIncrement: true });
    },
    2: (db) => {
      db.createObjectStore('test2', { autoIncrement: true });
    },
    10: (db) => {
      db.createObjectStore('test3', { autoIncrement: true });
    }
  })

  expect("db exists", () => db !== undefined);
  expect("toNative give IDBDatabase", async () => {
    return (await db.toNative()) instanceof IDBDatabase;
  });
  expectEqual("version 10", 10, () => db.version());
  expectEqual("name", "test-db-database", () => db.name());
  expectEqual("storeNames length", 3, async () => {
    return (await db.storeNames()).length
  });
  expectDeepEqual("storeNames", ["test", "test2", "test3"], async () => {
    return await db.storeNames();
  })
  expect("store is Store", () => {
    return db.store('test2') instanceof Store;
  });
  expectErr("store does not exist", async () => {
    await db.store('no such store').toNative();
  })

  expect("Database.wrap can re-wrap a native object", async () => {
    const native = await db.toNative();
    const wrapped = Database.wrap(native);
    const unwraped = await wrapped.toNative();
    return native === unwraped
  })

  expectDeepEqual(
    "Schema",
    {
      dogs: {
        keyPath: null,
        autoIncrement: false,
        recordCount: 1,
        indexes: [],
      },
      people: {
        keyPath: "id",
        autoIncrement: true,
        recordCount: 2,
        indexes: [
          {name: "fname", keyPath: "fname",
           unique: true, multiEntry: false},
          {name: "likes", keyPath: "likes",
           unique: false, multiEntry: true},
        ],
      },
    },
    async () => {
      await responsePromise(
        window.indexedDB.deleteDatabase('test-db-schema'));
      const db = new Database("test-db-schema", {
        1: (db) => {
          db.createObjectStore("dogs");

          const people = db.createObjectStore("people", {
            keyPath: "id", autoIncrement: true,
          });
          people.createIndex("fname", "fname", { unique: true });
          people.createIndex("likes", "likes", { multiEntry: true });
        }
      });

      await db.store("people").add({
        fname: "Charlie", likes: ["football", "red hair"]
      });
      await db.store("people").add({
        fname: "Lucy", likes: ["therapy", "football"]
      });

      await db.store("dogs").add({name: "Snoopy"}, 1)

      const output = await db.schema();
      return output;
  });

});

it("Store", async () => {
  responsePromise(
    window.indexedDB.deleteDatabase('test-db-store'));
  const db = new Database("test-db-store", {
    1: (db) => {
      // For configurations of keys in stores.
      // Each configuration has different error cases.

      // out-of-line keys, no key generator
      db.createObjectStore('outlineNogen');

      // out-of-line key, has key generator
      db.createObjectStore(
        'outlineKeygen', { autoIncrement: true } );

      // in-line keys, no key generator
      db.createObjectStore(
        'inlineNogen', { keyPath: 'id' } );

      // in-line keys, key generator
      db.createObjectStore(
        'inlineKeygen', { autoIncrement: true, keyPath: 'id' } );

      // deep key autoincrement
      db.createObjectStore(
        'deepkeyauto', { autoIncrement: true, keyPath: 'a.b.c.id' } );

      const hasIndexStore = db.createObjectStore('hasIndex');
      hasIndexStore.createIndex("idx", "idx");
      hasIndexStore.createIndex("idx2", "idx2");

      const clearTest = db.createObjectStore('clearTest');
    },
  })

  expect("Cursor can return a cursor object", () => {
    const outlineNogen = db.store('outlineNogen');
    return outlineNogen.cursor() instanceof Cursor;
  })

  expect("Index returns an index object", () => {
    const hasIndex = db.store('hasIndex');
    return hasIndex.index("idx") instanceof Index;
  })

  expect("toNative can return an IDBStore object", async () => {
    const outlineNogen = db.store('outlineNogen');
    return (await outlineNogen.toNative()) instanceof IDBObjectStore;
  })

  expectDeepEqual("indexNames returns names", ["idx", "idx2"], async () => {
    const hasIndex = db.store('hasIndex');
    return hasIndex.indexNames();
  })

  expect("Store.transaction returns a Transaction object", async () => {
    const outlineNogen = db.store('outlineNogen');
    return await outlineNogen.transaction() instanceof Transaction
  })

  expect("Store.wrap static method works in migrations", async () => {
    window.indexedDB.deleteDatabase('test-db-database.wrap')
    const db = new Database('test-db-database.wrap', {
      1: (db) => {
        const testStore = db.createObjectStore(
          'test', { keyPath: 'id', autoIncrement: true });

        const test = Store.wrap(testStore)
        test.add({ id: 3, data: 123});
      }
    });

    const result = await db.store('test').get(3);
    return result.data === 123
  });

  it("add", () => {
    it("Out of line keys, no key generator", () => {
      expectEqual("Can provide manual key (add)", 123, async () => {
        const outlineNogen = db.store('outlineNogen');
        return await outlineNogen.add({test: 1}, 123);
      });
      expectErr("No key fails (add)", async () => {
        const outlineNogen = db.store('outlineNogen');
        await outlineNogen.add({test: 2});
      });
    });

    it("Out of line keys, has key generator", () => {
      expect("Can omit key (add)", async () => {
        const outlineKeygen = db.store('outlineKeygen');
        const key = await outlineKeygen.add({test: 3});
        return typeof(key) === "number";
      });
      expectEqual("Providing key still works", 123, async () => {
        const outlineKeygen = db.store('outlineKeygen');
        return await outlineKeygen.add({test: 4}, 123);
      });
    });

    it("Inline keys, no key generator", () => {
      expectEqual("Can manually provide key inline", 245, async () => {
        const inlineNogen = db.store('inlineNogen');
        return inlineNogen.add({test: 5, id: 245});
      });
      expectErr("Providing a key parameter is an error", async () => {
        const inlineNogen = db.store('inlineNogen');
        await inlineNogen.add({test: 6, id: 123}, 123);
      });
      expectErr("Not providing a key inline is an error", async () => {
        const inlineNogen = db.store('inlineNogen');
        await inlineNogen.add({test: 7});
      });
    });

    it("Inline keys, has key generator", () => {
      expect("Can omit key", async () => {
        const inlineKeygen = db.store('inlineKeygen');
        const key = await inlineKeygen.add({test: 8});
        return typeof(key) === "number";
      });
      expectEqual("Can provide key inline", 345, async () => {
        const inlineKeygen = db.store('inlineKeygen');
        return await inlineKeygen.add({test: 8, id: 345});
      });
      expectErr("Providing a key param is an error", async () => {
        const inlineKeygen = db.store('inlineKeygen');
        await inlineKeygen.add({test: 9}, 456);
      });
    });

    it("Deep key auto generation", () => {
      expect("Can auto create key", async () => {
        const deepkeyauto = db.store('deepkeyauto');
        const key = await deepkeyauto.add({test: 20});
        return key > 0;
      });
      expectEqual("Can provide key", 12345, async () => {
        const deepkeyauto = db.store('deepkeyauto');
        const key = await deepkeyauto.add(
          {test: 20, a: {b: {c: {id: 12345 }}}}
        );
        return key;
      });
    })

    expectErr("adding multiple keys errors", async () => {
      const outlineNogen = db.store('outlineNogen');
      await outlineNogen.add({test: 5}, 777);
      await outlineNogen.add({test: 52}, 777);
    })
  });

  it("get", () => {
    expect("outline, no keygen roundtrip", async () => {
      const outlineNogen = db.store('outlineNogen');
      let id = await outlineNogen.add({test: 13}, 222);
      let result = await outlineNogen.get(222);
      return result.test === 13;
    });
    expect("outline, keygen roundtrip", async () => {
      const outlineKeygen = db.store('outlineKeygen');
      let id = await outlineKeygen.add({test: 12});
      let result = await outlineKeygen.get(id);
      return result.test === 12;
    });
    expect("inline, no keygen roundtrip", async () => {
      const inlineNogen = db.store('inlineNogen');
      let id = await inlineNogen.add({test: 10, id: 111});
      let result = await inlineNogen.get(111);
      return result.test === 10;
    });
    expect("inline, keygen roundtrip", async () => {
      const inlineKeygen = db.store('inlineKeygen');
      let id = await inlineKeygen.add({test: 11});
      let result = await inlineKeygen.get(id);
      return result.test === 11;
    });
    expectEqual("get based on deep key", 20, async() => {
      const deepkeyauto = db.store('deepkeyauto');
      const key = 2468
      await deepkeyauto.add(
        {test: 20, a: {b: {c: {id: key }}}}
      );
      const got = await deepkeyauto.get(key);
      return got.test;
    })
  });

  it("put", () => {
    expect('Creates entry if not exists', async () => {
      const key = 73892;
      const outlineNogen = db.store('outlineNogen');
      const beforePut = await outlineNogen.get(key);
      await outlineNogen.put({test: 18}, key);
      const afterPut = await outlineNogen.get(key);

      return beforePut === undefined && afterPut !== undefined;
    });

    expect('Updates entry if does exist', async () => {
      const key = 21828;
      const outlineNogen = db.store('outlineNogen');
      await outlineNogen.put({test: 19}, key);
      const beforePut = await outlineNogen.get(key);
      await outlineNogen.put({test: 20}, key);
      const afterPut = await outlineNogen.get(key);

      return beforePut.test === 19 && afterPut.test === 20;
    });
  })

  it("count", () => {
    expect("Can count records", async () => {
      const hasIndex = db.store('hasIndex');
      await hasIndex.add({test: 14}, 1);
      return await hasIndex.count() >= 1;
    });
    expect("it counts records matching a key query", async () => {
      const key = 33;
      const hasIndex = db.store('hasIndex');
      await hasIndex.add({test: 15}, key);
      await hasIndex.add({test: 15}, 123);
      return await hasIndex.count(key) === 1;
    });
    expect("it counts records matching a key range query", async () => {
      const hasIndex = db.store('hasIndex');
      const keyRange = IDBKeyRange.lowerBound(1000);
      await hasIndex.add({test: 16}, 900);
      await hasIndex.add({test: 16}, 1100);
      await hasIndex.add({test: 16}, 1200);
      return await hasIndex.count(keyRange) === 2;
    });
  });

  it("clear", () => {
    expect("it clears records", async () => {
      const clearTest = db.store('clearTest');
      const countBefore = await clearTest.count();
      await clearTest.add({test: 17}, 1);
      await clearTest.add({test: 17}, 2);
      const countBetween = await clearTest.count();
      await clearTest.clear();
      const countAfterClear = await clearTest.count();
      return (
        countBefore === 0
        && countBetween === 2
        && countAfterClear === 0
      )
    });
  });
});

it("Index", async () => {
  await responsePromise(
    window.indexedDB.deleteDatabase('test-db-index'));
  const db = new Database("test-db-index", {
    1: (db) => {
      const phonebook = db.createObjectStore(
        "phonebook", { autoIncrement: true }
      );
      phonebook.createIndex("firstname", "firstname");
      phonebook.createIndex("lastname", "lastname");
      phonebook.createIndex("fullname", ["firstname", "lastname"]);
      phonebook.createIndex("phonenumber", "phonenumber", { unique: true});
      phonebook.createIndex("contactType", "contactType", { multiEntry: true});
    }
  })
  const loadSampleData = (store) => {
    const out = [];
    const data = [
      ["Charlie", "Brown", "555-123-4567", ["Friends"]],
      ["Snoopy", "Dog", "555-123-4568", ["Animals", "Friends"]],
      ["Lucy", "Van Pelt", "555-123-4569", ["Friends", "Therapy"]],
      ["Linus", "Van Pelt", "555-123-4570", ["Friends"]],
    ];
    for (const d of data) {
      const [firstname, lastname, phonenumber, contactType] = d;
      const row = { firstname, lastname, phonenumber, contactType };
      out.push(store.add(row));
    }
    return out;
  }

  expectEqual("keypath", "firstname", async () => {
    const phonebook = db.store('phonebook');
    return await phonebook.index('firstname').keyPath();
  })

  expectDeepEqual("multiEntry", [true, false], async () => {
    const phonebook = db.store('phonebook');
    return [
      await phonebook.index('contactType').multiEntry(),
      await phonebook.index('firstname').multiEntry(),
    ];
  })

  expectEqual("name", "fullname", async () => {
    const phonebook = db.store('phonebook');
    return await phonebook.index('fullname').name();
  })

  expectDeepEqual("unique", [true, false], async () => {
    const phonebook = db.store('phonebook');
    return [
      await phonebook.index('phonenumber').unique(),
      await phonebook.index('fullname').unique(),
    ];
  })

  expect("toNative returns IDBIndex object", async () => {
    const phonebook = db.store('phonebook');
    const number = phonebook.index('phonenumber')
    return await number.toNative() instanceof IDBIndex
  })

  expect("Index.wrap can wrap a native IDB object", async () => {
    const nativeIdx = await db
      .store("phonebook").index('phonenumber').toNative();
    const wrapped = Index.wrap(nativeIdx);
    const unwrapped = await wrapped.toNative();
    return nativeIdx == unwrapped;
  })

  it("count", () => {
    expectEqual("Counts the number of records", 4, async () => {
      const phonebook = db.store('phonebook');
      await phonebook.clear();
      await Promise.all(loadSampleData(phonebook));
      return await phonebook.index("phonenumber").count();
    })

    expectEqual("Counts filtered records", 3, async () => {
      const phonebook = db.store('phonebook');
      await phonebook.clear();
      await Promise.all(loadSampleData(phonebook));
      return await phonebook
        .index("phonenumber")
        .count(IDBKeyRange.lowerBound("555-123-4568"));
    });

    expectEqual("Counts key match", 2, async () => {
      const phonebook = db.store('phonebook');
      await phonebook.clear();
      await Promise.all(loadSampleData(phonebook));
      return await phonebook
        .index("lastname")
        .count("Van Pelt");
    });

    expectEqual("Counts multientry match", 4, async () => {
      const phonebook = db.store('phonebook');
      await phonebook.clear();
      await Promise.all(loadSampleData(phonebook));
      return await phonebook
        .index("contactType")
        .count("Friends");
    });
  });

  it("get", () => {
    expectEqual('Fetch a phone number by name', "555-123-4567", async () => {
      const phonebook = db.store('phonebook');
      await phonebook.clear();
      await Promise.all(loadSampleData(phonebook));
      const charlie = await phonebook.index("firstname").get("Charlie")
      return charlie.phonenumber;
    })
  })
})

it("Cursor -- store backed", async () => {
  await responsePromise(
    window.indexedDB.deleteDatabase('test-db-cursor'));
  const db = new Database("test-db-cursor", {
    1: (db) => {
      const s = db.createObjectStore("store", { autoIncrement: true });
      s.createIndex("idxdata", "data");

      db.createObjectStore("drop-test", { autoIncrement: true });
      db.createObjectStore("update-test", { autoIncrement: true });
    }
  });

  const doAdd = db.store("store");
  for (const num of [1, 2, 3, 4]) {
    await doAdd.add({data: num});
  }

  it("collect", () => {
    expectDeepEqual(
      "returns expected array, no filters, no transforms",
      [
        {key:1, value: {data: 1}},
        {key:2, value: {data: 2}},
        {key:3, value: {data: 3}},
        {key:4, value: {data: 4}},
      ],
      async () => {
        const store = db.store("store");
        return await store.cursor().collect();
      }
    );

    expectDeepEqual(
      "where filters work",
      [
        {key:2, value: {data: 2}},
        {key:3, value: {data: 3}},
      ],
      async () => {
        const store = db.store("store");
        return await store
          .cursor()
          .where(({key, value}) => key >= 2)
          .where(({key, value}) => value.data <= 3)
          .collect();
      }
    );

    expectDeepEqual("transform", [2, 4, 6, 8], async () => {
      const store = db.store("store");
      return await store
        .cursor()
        .transform(({key, value}) => value.data)
        .transform(d => d * 2)
        .collect();
    });

    expectEqual("handles key query", 2, async () => {
      const store = db.store("store");
      const key = 2;
      const result = await store.cursor(key).collect()
      return result[0].value.data;
    });

    expectDeepEqual("handles IDBKeyRange query", [2, 3], async () => {
      const store = db.store("store");
      const key = IDBKeyRange.bound(2, 3);
      const result = await store.cursor(key).collect();
      return [result[0].value.data, result[1].value.data];
    });

    expectEqual("handles direction next", 1, async () => {
      const store = db.store("store");
      const direction = "next";
      const result = await store.cursor(undefined, direction).collect();
      return result[0].key;
    });

    expectEqual("handles direction prev", 4, async () => {
      const store = db.store("store");
      const direction = "prev";
      const result = await store.cursor(undefined, direction).collect();
      return result[0].key;
    });

  })

  it("collectGroup", () => {
    expectDeepEqual(
      "group by key is even",
      {
        false: [
          {key:1, value: {data: 1}},
          {key:3, value: {data: 3}},
        ],
        true: [
          {key:2, value: {data: 2}},
          {key:4, value: {data: 4}},
        ],
      },
      async () => {
        const store = db.store("store");
        return await store
          .cursor()
          .collectGroup((record) => record.key % 2 === 0);
      }
    );
    expectDeepEqual(
      "plays nice with where",
      {
        false: [ {key:1, value: {data: 1}} ],
        true: [ {key:2, value: {data: 2}} ],
      },
      async () => {
        const store = db.store("store");
        return await store
          .cursor()
          .where(({key}) => key < 3)
          .collectGroup((record) => record.key % 2 === 0);
      }
    );
    expectDeepEqual(
      "plays nice with transform",
      { false: [ 1, 3 ], true: [ 2, 4 ]},
      async () => {
        const store = db.store("store");
        return await store
          .cursor()
          .transform(({key}) => key)
          .collectGroup((n) => n % 2 === 0);
      }
    );
  });

  it("collectReduce", () => {
    expectEqual("Sum data", 10, async () => {
      const store = db.store("store");
      const cursor = store.cursor();
      return await cursor.collectReduce((acc, {key, value}) => {
        return acc + value.data;
      }, 0);
    });
  });

  it("performDrop", () => {
    expect("Drop drops all values", async () => {
      const store = db.store("drop-test");
      const countBefore = await store.count();
      await store.add({data: 1});
      await store.add({data: 2});
      await store.add({data: 3});
      const countBetween = await store.count();
      const dropPromises = await store.cursor().performDrop();
      await Promise.all(dropPromises);
      const countAfter = await store.count();
      return (
        countBefore === 0
        && countBetween === 3
        && countAfter === 0
      );
    });
    expect("Respects where", async () => {
      const store = db.store("drop-test");
      const countBefore = await store.count();
      await store.add({data: 1});
      await store.add({data: 2});
      await store.add({data: 3});
      const countBetween = await store.count();
      const dropPromises = await store
        .cursor()
        .where(({key, value}) => value.data !== 2)
        .performDrop();
      await Promise.all(dropPromises);
      const countAfter = await store.count();
      await store.clear();
      return (
        countBefore === 0
        && countBetween === 3
        && countAfter === 1
      );
    });
  });

  it("performUpdate", () => {
    expectEqual("it updates", 3, async () => {
      const store = db.store("update-test");
      await store.clear();
      await store.add({ data: 1 }, 1);
      await store.add({ data: 2 }, 2);
      const updates = await store
        .cursor()
        .performUpdate(({key, value}) => ({ data: value.data + 1 }));
      await Promise.all(updates);
      return (await store.get(2)).data;
    });

    expectEqual("It respects where", 2, async () => {
      const store = db.store("update-test");
      await store.clear();
      await store.add({ data: 1 }, 1);
      await store.add({ data: 2 }, 2);
      const updates = await store
        .cursor()
        .where(({key, value}) => value === 1)
        .performUpdate(({key, value}) => ({ data: value.data + 1 }));
      await Promise.all(updates);
      return (await store.get(2)).data;
    });
  });
});

it("Cursor -- Index Backed", () => {

  const db = new Database('test-db-index-cursor', {
    1: (db) => {
      const store = db.createObjectStore('employees', { autoIncrement: true });
      store.createIndex('empid', 'empid', { unique: true });
      store.createIndex('name', 'name');
      store.createIndex('salary', 'salary');
      store.createIndex('role', 'role');
      store.createIndex('reports', 'reports', { multiEntry: true });
      store.createIndex('rolesalary', ["role", "salary"]);
    }
  });

  async function seedDb(db) {
    const emp = db.store('employees');
    const emps = [
      [1, "Snoopy", 100, "Dog", []],
      [2, "Charlie", 200, "Kid", [1]],
      [3, "Lucy", 200, "Kid", []],
      [4, "Linus", 100, "Kid", []],
      [5, "Ms Othmar", 400, "Teacher", [2, 4]],
    ]

    await emp.clear();
    const adds = [];
    for (const e of emps) {
      adds.push(emp.add({
        empid: e[0], name: e[1], salary: e[2], role: e[3], reports: e[4],
      }));
    }
    return Promise.all(adds);
  }

  expectDeepEqual(
    "can query",
    ["Charlie", "Linus", "Lucy", "Ms Othmar", "Snoopy"],
    async () => {
      await seedDb(db);
      const emp = db.store("employees");
      const results = await emp
        .index("name").cursor().transform(({value}) => value.name).collect();
      return results
  })

  expectDeepEqual(
    "filtering with key range",
    ["Linus", "Lucy"],
    async () => {
      await seedDb(db);
      const emp = db.store("employees");
      const results = await emp
        .index("name")
        .cursor(IDBKeyRange.bound("L", "M"))
        .transform(({value}) => value.name)
        .collect();
      return results
  });

  expectDeepEqual(
    "filtering with where (other columns)",
    ["Charlie", "Lucy", "Ms Othmar"],
    async () => {
      await seedDb(db);
      const emp = db.store("employees");
      const results = await emp
        .index("name")
        .cursor()
        .where(({value}) => value.salary >= 200)
        .transform(({value}) => value.name)
        .collect();
      return results
  });

  expectDeepEqual(
    "MultiEntry Index - Who Manages Charlie",
    ["Ms Othmar"],
    async () => {
      await seedDb(db);
      const emp = db.store("employees");
      const results = await emp
        .index("reports")
        .cursor(IDBKeyRange.only(2))
        .transform(({value}) => value.name)
        .collect();
      return results
  });

  it('Sort direction', async () => {
    await seedDb(db);
    const getSal = ({value}) => value.salary;
    const salary = db.store("employees").index("salary");

    expectDeepEqual(
      "next - salaries", [100, 100, 200, 200, 400], async () => {
        return await salary
          .cursor(undefined, "next").transform(getSal).collect();
    });
    expectDeepEqual(
      "prev - salaries", [400, 200, 200, 100, 100], async () => {
        return await salary
          .cursor(undefined, "prev").transform(getSal).collect();
    });
    expectDeepEqual(
      "nextunique - salaries", [100, 200, 400], async () => {
        return await salary
          .cursor(undefined, "nextunique").transform(getSal).collect();
    });
    expectDeepEqual(
      "prevunique - salaries", [400, 200, 100], async () => {
        return await salary
          .cursor(undefined, "prevunique").transform(getSal).collect();
    });
  });

  it('Compound index: role & salary -- rolesalary', () => {
    expectDeepEqual("High Kid salary", ["Charlie", "Lucy"], async () => {
      await seedDb(db);
      const emp = db.store("employees");
      const results = await emp
        .index("rolesalary")
        .cursor(IDBKeyRange.bound(
          ["Kid", 100],
          ["Kid", []], // Array is always greater than a number
          false, false
        ))
        .where(({value}) => value.salary >= 200)
        .transform(({value}) => value.name)
        .collect();
      return results
    });
  });
});

it('Transaction', () => {
  responsePromise(
    window.indexedDB.deleteDatabase('test-db-transaction'));
  const db = new Database('test-db-transaction', {
    1: (db) => {
      db.createObjectStore('left', { autoIncrement: true });
      db.createObjectStore('right', { autoIncrement: true });
    }
  })

  expect('toNative gives IDBTransaction', async () => {
    const transaction = db.transaction(["left", "right"]);
    return await transaction.toNative() instanceof IDBTransaction;
  });

  expect('store gives a Store instance', () => {
    const transaction = db.transaction(["left", "right"]);
    return transaction.store("left") instanceof Store;
  });

  expect('Can access either store', async () => {
    const transaction = db.transaction(["left", "right"], "readwrite");
    const left = transaction.store("left");
    const right = transaction.store("right");
    const dataToAdd = 1;
    const lkey = await left.add({dat: dataToAdd});
    const rkey = await right.add({dat: dataToAdd});
    return await left.get(lkey).dat === await right.get(rkey).dat;
  });

  expectErr('Invalid mode raises an error', async () => {
    const transaction = db.transaction("left", "INVALID_MODE");
    const left = transaction.store("left");
    await left.add({dat: 1});
  })

  expectErr('Readonly mode prevents writes', async () => {
    const transaction = db.transaction("left", "readonly");
    const left = transaction.store("left");
    await left.add({dat: 1});
  });

  expectErr("abort prevents further access", async () => {
    const transaction = db.transaction("left", "readwrite");
    const left = transaction.store("left");
    await left.add({dat: 1});
    transaction.abort();
    await left.add({dat: 2});
  });

  expectEqual('abort rolls back', undefined, async () => {
    const key = 123;
    const transaction = db.transaction("left", "readwrite");
    const left = transaction.store("left");
    await left.add({dat: 1}, key);
    transaction.abort();

    const transaction2 = db.transaction("left", "readwrite");
    const left2 = transaction2.store("left")
    const result = await left2.get(key);
    return result;
  });

  expectEqual('error during transaction rolls back', undefined, async () => {
    const key = 123;
    const transaction = db.transaction("left", "readwrite");
    const left = transaction.store("left");
    await left.add({dat: 1}, key);
    try {
      // Adding with a duplicate key is an error, should abort transaction
      await left.add({dat: 1}, key);
    } catch (err) { }

    const transaction2 = db.transaction("left", "readwrite");
    const left2 = transaction2.store("left")
    const result = await left2.get(key);
    return result;
  });

  expectEqual('Handling error prevents rollback', 1, async () => {
    await db.store('left').clear();
    const key = 777;
    const expected = 1;
    const unexpected = 9000;
    const transaction = db.transaction("left", "readwrite");
    const left = transaction.store("left");

    // first entry
    await left.add({dat: expected}, key);

    // Try to add, but ignore an error if it happens
    await responsePromise(
      (await left.toNative()).add({dat: unexpected}, key),
      undefined,
      (ev) => {
        ev.preventDefault();
        return 'Record exists, skipping';
      }
    ).catch((err) => {
      if (err !== "Record exists, skipping") {
        throw(err)
      }
    });

    transaction.commit();

    const transaction2 = db.transaction("left", "readwrite");
    const left2 = transaction2.store("left")
    const result = await left2.get(key);
    return result.dat;
  });

  expectErr("commit prevents further access", async () => {
    const transaction = db.transaction("left", "readwrite");
    const left = transaction.store("left");
    await left.add({dat: 22});

    await transaction.commit();

    await left.add({dat: 44});
  });

  expectEqual("commit does not roll back", 101, async () => {
    const transaction = db.transaction("left", "readwrite");
    const left = transaction.store("left");

    await left.clear();
    const id = await left.add({dat: 101});
    await transaction.commit();

    const transaction2 = db.transaction("left", "readwrite");
    const left2 = transaction2.store("left");
    return (await left2.get(id)).dat;
  });
})
