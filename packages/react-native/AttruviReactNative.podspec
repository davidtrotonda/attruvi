require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |spec|
  spec.name         = "AttruviReactNative"
  spec.version      = package["version"]
  spec.summary      = package["description"]
  spec.homepage     = "https://attruvi.com"
  spec.license      = "MIT"
  spec.authors      = { "Attruvi" => "opensource@attruvi.com" }
  spec.platforms    = { :ios => "15.1" }
  spec.source       = { :git => "https://github.com/davidtrotonda/attruvi.git", :tag => spec.version.to_s }
  spec.source_files = "ios/**/*.{h,m,mm,swift}"
  spec.swift_version = "5.9"

  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(spec)
  else
    spec.dependency "React-Core"
  end
end
