import {
  profileToHtml,
  type AuthorProfile,
} from "@/config/author";

interface AuthorProfileViewProps {
  profile: AuthorProfile;
}

export function AuthorProfileView({ profile }: AuthorProfileViewProps) {
  const profileHtml = profileToHtml(profile.profile);
  const subtitle = profile.subtitle?.trim() ?? "";

  return (
    <article className="author-profile">
      <section className="author-hero">
        <p className="author-eyebrow">ABOUT THE AUTHOR</p>
        <h1 className="author-title">{profile.title}</h1>
        {subtitle ? <p className="author-tagline">{subtitle}</p> : null}
      </section>

      <section className="author-body">
        <div
          className="author-copy"
          dangerouslySetInnerHTML={{ __html: profileHtml }}
        />
      </section>
    </article>
  );
}
