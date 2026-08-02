import assert from 'node:assert/strict';
import fileSystem from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
	replaceDirectory,
	retryFileSystemOperation,
} from './directory-replacement';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
	const directory = await fileSystem.mkdtemp(path.join(os.tmpdir(), 'directory-replacement-test-'));

	temporaryDirectories.push(directory);

	return directory;
};

afterEach(async () => {
	const directoriesToRemove = [...temporaryDirectories];

	temporaryDirectories.length = 0;

	await Promise.all(directoriesToRemove.map(async (directory) => {
		await fileSystem.rm(directory, { force: true, recursive: true });
	}));
});

describe('Directory replacement', () => {
	it('Retries transient Windows file-system failures', async () => {
		let attemptCount = 0;

		await retryFileSystemOperation(async () => {
			attemptCount++;

			if (attemptCount < 3) {
				const error = new Error('Directory is temporarily locked') as NodeJS.ErrnoException;

				error.code = 'EPERM';
				throw error;
			}
		}, 2, 0);

		assert.equal(attemptCount, 3);
	});

	it('Replaces the current directory only after the next directory is ready', async () => {
		const root = await createTemporaryDirectory();
		const currentDirectory = path.join(root, 'reports');
		const nextDirectory = path.join(root, 'reports-next');

		await Promise.all([
			fileSystem.mkdir(currentDirectory),
			fileSystem.mkdir(nextDirectory),
		]);
		await Promise.all([
			fileSystem.writeFile(path.join(currentDirectory, 'old.txt'), 'old'),
			fileSystem.writeFile(path.join(nextDirectory, 'new.txt'), 'new'),
		]);

		await replaceDirectory(nextDirectory, currentDirectory);

		assert.equal(await fileSystem.readFile(path.join(currentDirectory, 'new.txt'), 'utf8'), 'new');
		await assert.rejects(fileSystem.access(path.join(currentDirectory, 'old.txt')));
		await assert.rejects(fileSystem.access(nextDirectory));
	});

	it('Restores the current directory when publishing the next directory fails', async () => {
		const root = await createTemporaryDirectory();
		const currentDirectory = path.join(root, 'reports');
		const missingNextDirectory = path.join(root, 'missing-reports-next');

		await fileSystem.mkdir(currentDirectory);
		await fileSystem.writeFile(path.join(currentDirectory, 'old.txt'), 'old');

		await assert.rejects(replaceDirectory(missingNextDirectory, currentDirectory));

		assert.equal(await fileSystem.readFile(path.join(currentDirectory, 'old.txt'), 'utf8'), 'old');
	});
});
