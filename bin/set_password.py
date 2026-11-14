"""Change a user account password from the server shell.

This is an operator-only CLI, not a public password-reset endpoint. The new
password is read interactively or from stdin so it never appears in shell
history.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from core.security import hash_password
from db.session import SessionLocal
from models.users import User

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="set-password",
        description="Change a user's password in the Missing Island database.",
    )
    parser.add_argument(
        "--username",
        required=True,
        help="Login username of the account to update",
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
        password = getpass.getpass("New password: ")
        confirm = getpass.getpass("Confirm new password: ")
        if password != confirm:
            raise ValueError("비밀번호가 일치하지 않습니다.")

    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다."
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"비밀번호는 {MAX_PASSWORD_LENGTH}자 이하이어야 합니다."
        )
    return password


def main() -> int:
    args = parse_args()

    try:
        password = read_password(args.password_stdin)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(User.username == args.username)
            .first()
        )
        if user is None:
            print(
                f"username '{args.username}'을 찾을 수 없습니다.",
                file=sys.stderr,
            )
            return 1

        user.hashed_password = hash_password(password)
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(f"updated: id={user.id} username={user.username}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
