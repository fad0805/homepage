"use server";

export default async function AdminLinkDetail({
  params
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = await params;
  return (
    <div>{ linkId }</div>
  );
}
