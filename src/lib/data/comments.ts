import { supabase } from "@/lib/supabase";
import { throwOnError } from "./errors";

export type CommentRecord = {
  id: string;
  series_id: string;
  owner_id: string;
  body: string;
  spoiler: boolean;
  parent_id: string | null;
  created_at: string;
};

export async function listComments(seriesId: string, page: number, pageSize = 20) {
  const result = await supabase().from("comments").select("id,series_id,owner_id,body,spoiler,parent_id,created_at").eq("series_id", seriesId).order("created_at", { ascending: false }).order("id").range(page * pageSize, page * pageSize + pageSize - 1);
  return (throwOnError(result, "A conversa não carregou. Tente atualizar.") || []) as CommentRecord[];
}

export async function saveComment(input: Pick<CommentRecord, "series_id" | "owner_id" | "body" | "spoiler" | "parent_id">, id?: string) {
  const query = id
    ? supabase().from("comments").update({ body: input.body, spoiler: input.spoiler }).eq("id", id).eq("owner_id", input.owner_id)
    : supabase().from("comments").insert(input);
  throwOnError(await query, "Não foi possível publicar o comentário.");
}

export async function deleteComment(id: string) {
  throwOnError(await supabase().from("comments").delete().eq("id", id), "Não foi possível excluir o comentário.");
}

export async function reportComment(commentId: string, ownerId: string, reason: string) {
  throwOnError(await supabase().from("comment_reports").insert({ comment_id: commentId, owner_id: ownerId, reason }), "Não foi possível enviar a denúncia.");
}
