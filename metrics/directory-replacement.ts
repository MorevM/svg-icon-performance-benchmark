import fileSystem from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const DIRECTORY_OPERATION_MAX_RETRIES = 30;
const DIRECTORY_OPERATION_RETRY_DELAY_MS = 500;
const DIRECTORY_CLEANUP_MAX_RETRIES = 10;
const DIRECTORY_CLEANUP_RETRY_DELAY_MS = 250;
const RETRYABLE_DIRECTORY_ERROR_CODES = new Set([
	'EACCES',
	'EBUSY',
	'ENOTEMPTY',
	'EPERM',
]);

/**
 * An asynchronous file-system operation that can be retried after a transient failure.
 */
type FileSystemOperation = () => Promise<void>;

const hasErrorCode = (error: unknown, code: string): boolean => {
	return error instanceof Error && 'code' in error && error.code === code;
};

const isRetryableDirectoryError = (error: unknown): boolean => {
	return error instanceof Error
		&& 'code' in error
		&& typeof error.code === 'string'
		&& RETRYABLE_DIRECTORY_ERROR_CODES.has(error.code);
};

const formatError = (error: unknown): string => {
	return error instanceof Error ? error.message : String(error);
};

/**
 * Retries transient directory failures commonly caused by short-lived Windows file locks.
 *
 * @param   operation      File-system operation to run.
 * @param   maxRetries     Number of retries after the first attempt.
 * @param   retryDelayMs   Delay between attempts in milliseconds.
 */
const retryFileSystemOperation = async (
	operation: FileSystemOperation,
	maxRetries = DIRECTORY_OPERATION_MAX_RETRIES,
	retryDelayMs = DIRECTORY_OPERATION_RETRY_DELAY_MS,
): Promise<void> => {
	const runAttempt = async (remainingRetries: number): Promise<void> => {
		try {
			await operation();
		} catch (error) {
			if (remainingRetries === 0 || !isRetryableDirectoryError(error)) throw error;

			await wait(retryDelayMs);
			await runAttempt(remainingRetries - 1);
		}
	};

	await runAttempt(maxRetries);
};

/**
 * Removes a disposable directory without turning cleanup failure into command failure.
 *
 * @param   directory   Disposable directory to remove.
 */
const removeDirectoryBestEffort = async (directory: string): Promise<void> => {
	try {
		await fileSystem.rm(directory, {
			force: true,
			maxRetries: DIRECTORY_CLEANUP_MAX_RETRIES,
			recursive: true,
			retryDelay: DIRECTORY_CLEANUP_RETRY_DELAY_MS,
		});
	} catch (error) {
		process.emitWarning(`Could not remove disposable directory ${directory}: ${formatError(error)}`);
	}
};

/**
 * Replaces a directory while retaining the previous one until the replacement succeeds.
 *
 * @param   source        Complete directory that should become current.
 * @param   destination   Current directory to replace.
 */
const replaceDirectory = async (source: string, destination: string): Promise<void> => {
	const destinationParent = path.dirname(destination);
	const destinationName = path.basename(destination);
	const backupRoot = await fileSystem.mkdtemp(path.join(destinationParent, `.${destinationName}-backup-`));
	const backupDirectory = path.join(backupRoot, destinationName);
	let isPreviousDirectoryInBackup = false;
	let shouldPreserveBackup = false;

	try {
		try {
			await retryFileSystemOperation(async () => fileSystem.rename(destination, backupDirectory));
			isPreviousDirectoryInBackup = true;
		} catch (error) {
			if (!hasErrorCode(error, 'ENOENT')) throw error;
		}

		try {
			await retryFileSystemOperation(async () => fileSystem.rename(source, destination));
		} catch (publicationError) {
			if (!isPreviousDirectoryInBackup) throw publicationError;

			try {
				await retryFileSystemOperation(async () => fileSystem.rename(backupDirectory, destination));
				isPreviousDirectoryInBackup = false;
			} catch (rollbackError) {
				shouldPreserveBackup = true;

				throw new AggregateError(
					[publicationError, rollbackError],
					`Could not publish ${source} or restore the previous directory. The previous directory remains at ${backupDirectory}.`,
					{ cause: rollbackError },
				);
			}

			throw publicationError;
		}
	} finally {
		if (!shouldPreserveBackup) await removeDirectoryBestEffort(backupRoot);
	}
};

export {
	removeDirectoryBestEffort,
	replaceDirectory,
	retryFileSystemOperation,
};
