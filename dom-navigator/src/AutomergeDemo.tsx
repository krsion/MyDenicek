// import { IndexedDBStorageAdapter, Repo, RepoContext, WebSocketClientAdapter, isValidAutomergeUrl, DocHandle, type AutomergeUrl, useDocument } from '@automerge/react';
// import { PrimaryButton } from "@fluentui/react";
// const repo = new Repo({
//   network: [new WebSocketClientAdapter("wss://sync.automerge.org/")],
//   storage: new IndexedDBStorageAdapter()
// });


// type FooDoc = { foo: string };

// const locationHash = document.location.hash.substring(1);

// let handle: DocHandle<FooDoc>;

// if (isValidAutomergeUrl(locationHash)) {
//   handle = await repo.find(locationHash)
// } else {
//   handle = repo.create<FooDoc>({ foo: "bar" });
//   document.location.hash = handle.url;
// }

// export function AutomergeDemo() {
//   return (
//     <RepoContext.Provider value={repo}>
//       <Foo docUrl={handle.url} />
//     </RepoContext.Provider>
//   );
// };

// const Foo = ({ docUrl }: { docUrl: AutomergeUrl }) => {
//   const [doc, changeDoc] = useDocument<FooDoc>(docUrl, { suspense: true });
//   return (
//     <div>Hello, {doc.foo}
//       <PrimaryButton onClick={() => changeDoc(d => { d.foo = d.foo === "bar" ? "baz" : "bar"; })}>Toggle</PrimaryButton>
//     </div>
//   );
// };
