-- Grand livre immuable (D1/D7) : aucune écriture ne peut être modifiée, supprimée ni vidée.
CREATE OR REPLACE FUNCTION credit_entries_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credit_entries est immuable (% refusé)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER credit_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON credit_entries
  FOR EACH ROW EXECUTE FUNCTION credit_entries_immutable();
--> statement-breakpoint
CREATE TRIGGER credit_entries_no_truncate
  BEFORE TRUNCATE ON credit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION credit_entries_immutable();
