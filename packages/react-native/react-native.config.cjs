module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.attruvi.reactnative.AttruviPackage;',
        packageInstance: 'new AttruviPackage()',
      },
    },
  },
};
