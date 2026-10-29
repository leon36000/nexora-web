import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import {
  ModelDetail,
  modelMetaDescription,
} from "@/components/gateway/model-detail";
import { isLang } from "@/i18n/config";
import { buildPageMetadata, notFoundMetadata } from "@/lib/metadata";
import { MODEL_ID } from "@/lib/models/query";
import { SITE_NAME } from "@/lib/site";
import { getPublicCatalog } from "@/server/gateway/read";

/** Identifiants publiés connus au build ; les autres se rendent à la demande. Au moins une valeur est exigée. */
export async function generateStaticParams() {
  const catalog = await getPublicCatalog();
  const ids =
    catalog.models.length > 0
      ? catalog.models.map((m) => m.id)
      : ["nexora/exemple"];
  return ids.map((id) => ({ id: id.split("/") }));
}

async function findModel(segments: string[]) {
  const id = segments.map(decodeURIComponent).join("/");
  if (!MODEL_ID.test(id)) return { model: null, catalog: [] };
  const catalog = await getPublicCatalog();
  return {
    model: catalog.models.find((m) => m.id === id) ?? null,
    catalog: catalog.models,
  };
}

export async function generateMetadata(
  props: PageProps<"/[lang]/modeles/[...id]">,
): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const { model } = await findModel((await props.params).id);
  if (!model) return notFoundMetadata(lang);
  return buildPageMetadata({
    lang,
    path: `/modeles/${model.id}`,
    title: `${model.name} | ${SITE_NAME}`,
    description: modelMetaDescription(model, lang),
    siteName: SITE_NAME,
  });
}

/** Fiche d'un modèle : aperçu, tarifs, benchmarks sourcés, modèles similaires, appel par API (ou « bientôt disponible »). */
export default async function ModelPage(
  props: PageProps<"/[lang]/modeles/[...id]">,
) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const { model, catalog } = await findModel((await props.params).id);
  if (!model) notFound();
  return <ModelDetail model={model} catalog={catalog} lang={lang} />;
}
