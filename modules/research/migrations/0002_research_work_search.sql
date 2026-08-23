CREATE VIRTUAL TABLE research_work_search USING fts5(
  work_id UNINDEXED,
  title,
  abstract,
  authors,
  publication,
  identifiers,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE VIEW research_work_search_documents AS
SELECT
  w.id AS work_id,
  w.title AS title,
  COALESCE(w.abstract, '') AS abstract,
  COALESCE((
    SELECT group_concat(c.display_name, ' ')
    FROM research_editions e
    JOIN research_contributors c ON c.edition_id = e.id
    WHERE e.work_id = w.id
  ), '') AS authors,
  COALESCE((
    SELECT group_concat(
      trim(COALESCE(e.title, '') || ' ' || COALESCE(e.publication_title, '') || ' ' || COALESCE(e.publisher, '')),
      ' '
    )
    FROM research_editions e
    WHERE e.work_id = w.id
  ), '') AS publication,
  COALESCE((
    SELECT group_concat(i.scheme || ':' || i.value, ' ')
    FROM research_identifiers i
    WHERE (i.entity_type = 'work' AND i.entity_id = w.id)
       OR (i.entity_type = 'edition' AND i.entity_id IN (
         SELECT e.id FROM research_editions e WHERE e.work_id = w.id
       ))
  ), '') AS identifiers
FROM research_works w;
--> statement-breakpoint
INSERT INTO research_work_search
SELECT work_id, title, abstract, authors, publication, identifiers
FROM research_work_search_documents;
--> statement-breakpoint
CREATE TRIGGER research_work_search_work_insert
AFTER INSERT ON research_works BEGIN
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_work_update
AFTER UPDATE ON research_works BEGIN
  DELETE FROM research_work_search WHERE work_id = OLD.id;
  DELETE FROM research_work_search WHERE work_id = NEW.id;
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_work_delete
AFTER DELETE ON research_works BEGIN
  DELETE FROM research_work_search WHERE work_id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_edition_insert
AFTER INSERT ON research_editions BEGIN
  DELETE FROM research_work_search WHERE work_id = NEW.work_id;
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id = NEW.work_id;
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_edition_update
AFTER UPDATE ON research_editions BEGIN
  DELETE FROM research_work_search WHERE work_id IN (OLD.work_id, NEW.work_id);
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id IN (OLD.work_id, NEW.work_id);
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_edition_delete
AFTER DELETE ON research_editions BEGIN
  DELETE FROM research_work_search WHERE work_id = OLD.work_id;
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id = OLD.work_id;
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_contributor_insert
AFTER INSERT ON research_contributors BEGIN
  DELETE FROM research_work_search
  WHERE work_id = (SELECT work_id FROM research_editions WHERE id = NEW.edition_id);
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents
  WHERE work_id = (SELECT work_id FROM research_editions WHERE id = NEW.edition_id);
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_contributor_update
AFTER UPDATE ON research_contributors BEGIN
  DELETE FROM research_work_search WHERE work_id IN (
    SELECT work_id FROM research_editions WHERE id IN (OLD.edition_id, NEW.edition_id)
  );
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id IN (
    SELECT work_id FROM research_editions WHERE id IN (OLD.edition_id, NEW.edition_id)
  );
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_contributor_delete
AFTER DELETE ON research_contributors BEGIN
  DELETE FROM research_work_search
  WHERE work_id = (SELECT work_id FROM research_editions WHERE id = OLD.edition_id);
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents
  WHERE work_id = (SELECT work_id FROM research_editions WHERE id = OLD.edition_id);
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_identifier_insert
AFTER INSERT ON research_identifiers BEGIN
  DELETE FROM research_work_search WHERE work_id = CASE
    WHEN NEW.entity_type = 'work' THEN NEW.entity_id
    ELSE (SELECT work_id FROM research_editions WHERE id = NEW.entity_id)
  END;
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id = CASE
    WHEN NEW.entity_type = 'work' THEN NEW.entity_id
    ELSE (SELECT work_id FROM research_editions WHERE id = NEW.entity_id)
  END;
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_identifier_update
AFTER UPDATE ON research_identifiers BEGIN
  DELETE FROM research_work_search WHERE work_id IN (
    CASE WHEN OLD.entity_type = 'work' THEN OLD.entity_id
      ELSE (SELECT work_id FROM research_editions WHERE id = OLD.entity_id) END,
    CASE WHEN NEW.entity_type = 'work' THEN NEW.entity_id
      ELSE (SELECT work_id FROM research_editions WHERE id = NEW.entity_id) END
  );
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id IN (
    CASE WHEN OLD.entity_type = 'work' THEN OLD.entity_id
      ELSE (SELECT work_id FROM research_editions WHERE id = OLD.entity_id) END,
    CASE WHEN NEW.entity_type = 'work' THEN NEW.entity_id
      ELSE (SELECT work_id FROM research_editions WHERE id = NEW.entity_id) END
  );
END;
--> statement-breakpoint
CREATE TRIGGER research_work_search_identifier_delete
AFTER DELETE ON research_identifiers BEGIN
  DELETE FROM research_work_search WHERE work_id = CASE
    WHEN OLD.entity_type = 'work' THEN OLD.entity_id
    ELSE (SELECT work_id FROM research_editions WHERE id = OLD.entity_id)
  END;
  INSERT INTO research_work_search
  SELECT work_id, title, abstract, authors, publication, identifiers
  FROM research_work_search_documents WHERE work_id = CASE
    WHEN OLD.entity_type = 'work' THEN OLD.entity_id
    ELSE (SELECT work_id FROM research_editions WHERE id = OLD.entity_id)
  END;
END;
