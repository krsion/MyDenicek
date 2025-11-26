/**
 * This implementation allows duplicate keys. One key can appear multiple times in the order array.
 * However, the entities record will only keep one value per key.
 */

export type DictionaryKey = string | number | symbol;

export type OrderedDictionary<K extends DictionaryKey, V> = {
    entities: Record<K, V>;
    order: K[];
};

export function createOrderedDictionary<K extends DictionaryKey, V>() : OrderedDictionary<K, V> {
    return {
        entities: {} as Record<K, V>,
        order: [],
    };
}

export function push<K extends DictionaryKey, V>(dict: OrderedDictionary<K,V>, key: K, value: V): void {
    if (!(key in dict.entities)) {
        dict.entities[key] = value;
    }
    dict.order.push(key);
}

export function insertBefore<K extends DictionaryKey, V>(dict: OrderedDictionary<K,V>, targetKey: K, insertKey: K, insertValue: V): void {
    const targetIndex = dict.order.indexOf(targetKey);
    if (targetIndex === -1) return;
    if (!(insertKey in dict.entities)) {
        dict.entities[insertKey] = insertValue;
    }
    dict.order.splice(targetIndex, 0, insertKey);
}

export function insertAfter<K extends DictionaryKey, V>(dict: OrderedDictionary<K,V>, targetKey: K, insertKey: K, insertValue: V): void {
    const targetIndex = dict.order.indexOf(targetKey);
    if (targetIndex === -1) return;
    if (!(insertKey in dict.entities)) {
        dict.entities[insertKey] = insertValue;
    }
    dict.order.splice(targetIndex + 1, 0, insertKey);
}
