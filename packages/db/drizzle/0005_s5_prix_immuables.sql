-- Passerelle de modèles (S5) : historique de prix, événements d'usage et versions de catalogue figés.

-- Un prix ne change jamais : une modification crée une nouvelle ligne avec sa date d'effet.
CREATE OR REPLACE FUNCTION gateway_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% est en ajout seulement (% refusé)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER model_prices_append_only
  BEFORE UPDATE OR DELETE ON model_prices
  FOR EACH ROW EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint
CREATE TRIGGER model_prices_no_truncate
  BEFORE TRUNCATE ON model_prices
  FOR EACH STATEMENT EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint
CREATE TRIGGER usage_events_append_only
  BEFORE UPDATE OR DELETE ON usage_events
  FOR EACH ROW EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint
CREATE TRIGGER usage_events_no_truncate
  BEFORE TRUNCATE ON usage_events
  FOR EACH STATEMENT EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint

-- Un taux de change ne se supprime pas ; seule son approbation (une fois) le modifie.
CREATE OR REPLACE FUNCTION fx_rates_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.approved_at IS NULL
       AND NEW.usd_to_cad_micro = OLD.usd_to_cad_micro
       AND NEW.effective_at = OLD.effective_at THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'fx_rates : % refusé (seule l''approbation est permise)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER fx_rates_guard_row
  BEFORE UPDATE OR DELETE ON fx_rates
  FOR EACH ROW EXECUTE FUNCTION fx_rates_guard();
--> statement-breakpoint
CREATE TRIGGER fx_rates_no_truncate
  BEFORE TRUNCATE ON fx_rates
  FOR EACH STATEMENT EXECUTE FUNCTION fx_rates_guard();
--> statement-breakpoint

-- Hash figé (D3) : le contenu d'une version de configuration ne change jamais ; seuls son état
-- (brouillon → approuvé → publié → remplacé) et l'état « appliqué » évoluent.
CREATE OR REPLACE FUNCTION config_versions_frozen() RETURNS trigger AS $$
BEGIN
  IF NEW.collection IS DISTINCT FROM OLD.collection
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.hash IS DISTINCT FROM OLD.hash
     OR NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'config_versions : le contenu et le hash d''une version sont figés' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER config_versions_frozen_row
  BEFORE UPDATE ON config_versions
  FOR EACH ROW EXECUTE FUNCTION config_versions_frozen();
