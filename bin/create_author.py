"""Create an author account from the server shell.

This is intentionally a server-side CLI, not a public signup endpoint.
The public author profile (slug, theme, layout, visibility) can be set after
the author signs in and the author_settings feature is available.
"""

from __future__ import annotations

import argparse
import getpass
import re
import sys

from sqlalchemy.exc import IntegrityError

from core.security import hash_password
from db.session import SessionLocal
from models.users import User

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{2,49}$")
MIN_PASSWORD_LENGTH = 8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="create-author",
        description="Create an author account in the Missing Island database.",
    )
    parser.add_argument(
        "--username",
        required=True,
        help="Login username (3-50 chars: letters, numbers, ., _, -)",
    )
    parser.add_argument(
        "--role",
        choices=("user", "admin"),
        default="user",
        help="Account role (default: user)",
    )
    parser.add_argument(
        "--password-stdin",
        action="store_true",
        help="Read one password line from stdin instead of prompting.",
    )
    return parser.parse_args()


def read_password(use_stdin: bool) -> str:
    if use_stdin:
        password = sys.stdin.readline().rstrip("\n")
        if not password:
            raise ValueError("stdin에서 비밀번호를 읽지 못했습니다.")
    else:
        if not sys.stdin.isatty():
            raise ValueError(
                "비밀번호를 대화형으로 입력할 수 없습니다. "
                "--password-stdin을 사용해주세요."
            )
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            raise ValueError("비밀번호가 일치하지 않습니다.")

    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다."
        )
    return password


def main() -> int:
    args = parse_args()

    if not USERNAME_RE.fullmatch(args.username):
        print(
            "username은 3~50자의 영문/숫자/. _ - 만 사용할 수 있습니다.",
            file=sys.stderr,
        )
        return 1

    try:
        password = read_password(args.password_stdin)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        existing = (
            db.query(User)
            .filter(User.username == args.username)
            .first()
        )
        if existing is not None:
            print(
                f"username '{args.username}'은 이미 존재합니다.",
                file=sys.stderr,
            )
            return 1

        user = User(
            username=args.username,
            hashed_password=hash_password(password),
            role=args.role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        print(
            f"username '{args.username}'을 생성하지 못했습니다. "
            "중복 여부를 확인해주세요.",
            file=sys.stderr,
        )
        return 1
    finally:
        db.close()

    print(
        f"created: id={user.id} username={user.username} role={user.role}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
