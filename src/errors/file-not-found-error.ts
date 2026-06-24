export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FILE_NOT_FOUND_ERROR";
  }
}