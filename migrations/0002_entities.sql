ALTER TABLE owner_state ADD COLUMN write_id TEXT NOT NULL DEFAULT '';
CREATE TABLE state_entities (
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(owner_id, kind, entity_id)
);
INSERT INTO state_entities
SELECT s.owner_id, 'accounts', json_extract(e.value, '$.id'), e.key, e.value FROM owner_state s, json_each(s.data, '$.accounts') e;
INSERT INTO state_entities
SELECT s.owner_id, 'posts', json_extract(e.value, '$.id'), e.key, e.value FROM owner_state s, json_each(s.data, '$.posts') e;
INSERT INTO state_entities
SELECT s.owner_id, 'captures', json_extract(e.value, '$.id'), e.key, e.value FROM owner_state s, json_each(s.data, '$.captures') e;
INSERT INTO state_entities
SELECT s.owner_id, 'paths', json_extract(e.value, '$.id'), e.key, json_set(json_remove(e.value, '$.explanations'), '$.currentDay', max(0, json_extract(e.value, '$.currentDay') - 1)) FROM owner_state s, json_each(s.data, '$.paths') e;
INSERT INTO state_entities
SELECT s.owner_id, 'explanations', json_extract(p.value, '$.id') || ':' || json_extract(e.value, '$.id'), e.key,
  json_object('pathId', json_extract(p.value, '$.id'), 'explanation', json_set(e.value, '$.day', max(0, json_extract(e.value, '$.day') - 1)))
  FROM owner_state s, json_each(s.data, '$.paths') p, json_each(p.value, '$.explanations') e;
INSERT INTO state_entities
SELECT s.owner_id, 'followedAccounts', e.value, e.key, json_quote(e.value) FROM owner_state s, json_each(s.data, '$.followedAccounts') e;
INSERT INTO state_entities
SELECT s.owner_id, 'followedTags', e.value, e.key, json_quote(e.value) FROM owner_state s, json_each(s.data, '$.followedTags') e;
UPDATE owner_state SET data = json_object('storage', 2, 'user', json_extract(data, '$.user'), 'lastRefreshed', json_extract(data, '$.lastRefreshed'));
