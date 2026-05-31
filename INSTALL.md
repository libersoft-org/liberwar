# LiberWar - installation

- These are the instructions on how to build this game from source code or run it in dev mode on your local machine.
- If you'd like to just play the game, navigate to: https://liberwar.com

## 1. Download the latest version of this game and install required tools

**On Linux (Debian / Ubuntu):**

Log in as **root** and then run in terminal:

```sh
apt update
apt -y upgrade
apt -y install git curl
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
git clone https://github.com/libersoft-org/liberwar.git
cd liberwar
```

**On macOS (terminal):**

```sh
brew install git
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/libersoft-org/liberwar.git
cd liberwar
```

**On Windows:**

Download and install [**Git**](https://git-scm.com/download/win) and [**Bun**](https://bun.sh/), then in the command line:

```bat
git clone https://github.com/libersoft-org/liberwar.git
cd liberwar
```

## 2. Build and play the game

**On Linux and macOS (terminal):**

```sh
./build.sh
```

**On Windows (PowerShell):**

```bat
.\build.bat
```

And then copy the content of the "build" folder to your web root.

## 3. Run the game in dev mode

**On Linux and macOS (terminal):**

```sh
./start-dev.sh
```

**On Windows (PowerShell):**

```bat
.\start-dev.bat
```

And then navigate to: http://127.0.0.1:3000/
