from sqlalchemy import Column
from schemas import links

class Links(links.LinkBase):
    __tablename__ = "links"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    url = Column(String(255), nullable=False)
    banner_url = Column(String(255), nullable=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"""
            <Link
                className="links-banner"
                href={self.url}
                target="_blank"
            >
                <Image
                    src={self.banner_url}
                    alt={self.description}
                    radius="none"
                />
                <p>{self.name}</p>
            </Link>
        """
