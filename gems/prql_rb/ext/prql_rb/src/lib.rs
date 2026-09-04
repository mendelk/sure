use std::str::FromStr;

use magnus::{function, prelude::*, Error, Ruby};
use prqlc::{Options, Target};

fn compile(
    ruby: &Ruby,
    source: String,
    target: String,
    format: bool,
    signature_comment: bool,
) -> Result<String, Error> {
    let compile_error = ruby
        .define_module("PrqlRb")?
        .const_get::<_, magnus::exception::ExceptionClass>("CompileError")?;
    let target =
        Target::from_str(&target).map_err(|error| Error::new(compile_error, error.to_string()))?;
    let options = Options::default()
        .with_target(target)
        .with_format(format)
        .with_signature_comment(signature_comment);

    prqlc::compile(&source, &options)
        .map_err(|errors| Error::new(compile_error, errors.to_string()))
}

fn compiler_version() -> String {
    prqlc::compiler_version().to_string()
}

#[magnus::init]
fn init(ruby: &Ruby) -> Result<(), Error> {
    let module = ruby.define_module("PrqlRb")?;
    module.define_error("CompileError", ruby.exception_standard_error())?;
    module.define_module_function("native_compile", function!(compile, 4))?;
    module.define_module_function("compiler_version", function!(compiler_version, 0))?;
    Ok(())
}
