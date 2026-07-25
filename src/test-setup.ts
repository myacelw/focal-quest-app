/**
 * fake-indexeddb/auto 把 indexedDB / IDBKeyRange 等挂到 globalThis，让 Dexie 在 node 环境可用。
 * 本迭代要单测 v5→v6 存量数据迁移与同步合并，非此不可测。
 * 对既有 241 个纯函数测试零副作用——它们根本不碰 IndexedDB。
 */
import 'fake-indexeddb/auto'
