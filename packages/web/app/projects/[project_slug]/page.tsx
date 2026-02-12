import AppShell from "@/components/AppShell"

type ProjectPageProps = {
  params: Promise<{
    project_slug: string
  }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { project_slug } = await params
  return <AppShell projectSlug={project_slug} />
}
