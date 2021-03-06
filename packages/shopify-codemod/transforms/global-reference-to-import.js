import {spawnSync} from 'child_process';
import {resolve, relative} from 'path';
import {findFirstMember, findLastMember, insertAfterDirectives} from './utils';

function determineFileSearcher() {
  if (spawnSync('which', ['ag']).status === 0) {
    return ['ag', ['--vimgrep']];
  } else if (spawnSync('which', ['ack']).status === 0) {
    return ['ack', ['--column', '--no-color', '--no-group', '--with-filename']];
  } else if (spawnSync('which', ['ack-grep']).status === 0) {
    return ['ack-grep', ['--column', '--no-color', '--no-group', '--with-filename']];
  } else {
    throw new Error('global-reference-to-import: Unable to find ack or the_silver_searcher binary');
  }
}

export default function globalReferenceToImport(
  {source},
  {jscodeshift: j},
  {
    printOptions = {},
    javascriptSourceLocation,
    appGlobalIdentifiers,
  }) {
  const [binary, args] = determineFileSearcher();

  /*
  * findDeclaringFile uses ack or the_silver_searcher to find the file in which something is declared.
  * It can use either, because ack is ubiquitous, while the_silver_searcher is much faster (like, 10x easily).
  */
  function findDeclaringFile(identifier) {
    const absolutePath = resolve(javascriptSourceLocation);
    const escapedIdentifier = identifier.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = `^(class ${escapedIdentifier}(\\s+|^)|${escapedIdentifier}\\s*=|["']expose ${escapedIdentifier}["'])`;
    const result = spawnSync(binary, [...args, regex, absolutePath]);

    if (result.error != null) {
      throw result.error;
    } else if (result.status === 1) {
      return null;
    } else if (result.status !== 0) {
      throw new Error(`Unknown error while resolving identifier:\n${result.stderr}`);
    }

    const stdout = result.stdout.toString();
    const parts = stdout.trim().split('\n');
    if (parts.length === 0) {
      return null;
    } else if (parts.length !== 1) {
      throw new Error(`Found multiple definitions for ${identifier}`);
    }

    const [filename] = parts[0].split(':', 4);
    return relative(absolutePath, filename).replace(/\.[a-z]+$/, '');
  }

  function isGlobalReference(object) {
    return appGlobalIdentifiers.indexOf(findFirstMember(object).name) >= 0;
  }

  return j(source)
    .find(j.Program)
    .forEach((path) => {
      const imports = new Map();

      function registerMember(node) {
        const member = j(node).toSource();
        if (imports.has(member)) {
          return imports.get(member).name;
        } else {
          const file = findDeclaringFile(member);
          if (file === null) {
            return null;
          }
          const name = findLastMember(node).name;
          imports.set(member, {file, name});
          return name;
        }
      }

      // First rename anything like `const UIList = App.Components.UIList;`
      j(path)
        .find(j.VariableDeclaration, {
          declarations: [{
            type: 'VariableDeclarator',
            id: {
              type: 'Identifier',
            },
            init: {
              type: 'MemberExpression',
              object: isGlobalReference,
            },
          }],
          kind: 'const',
        })
        .forEach((declarationPath) => {
          const declaration = declarationPath.get('declarations', 0);
          const name = registerMember(declaration.node.init);
          if (name == null) {
            return;
          }
          j(declaration).renameTo(name);
          declarationPath.prune();
        });

      // Last rename any remaining global references
      j(path)
        .find(j.MemberExpression, {
          object: isGlobalReference,
        })
        .replaceWith(({node}) => {
          const name = registerMember(node);
          if (name == null) {
            return node;
          } else {
            return j.identifier(name);
          }
        });

      for (const {file, name} of imports.values()) {
        const {node: {body}} = path;
        insertAfterDirectives(
          body,
          j.importDeclaration([
            j.importDefaultSpecifier(j.identifier(name)),
          ], j.literal(file))
        );
      }
    })
    .toSource(printOptions);
}
